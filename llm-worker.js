// Processo isolado da IA (node-llama-cpp).
// Roda em um processo filho separado do Electron: se o módulo nativo falhar
// por incompatibilidade de CPU (SIGILL / instruções AVX não suportadas), APENAS
// este processo encerra — o ERP continua rodando normalmente com fallback.
// Comunica-se com o main via process.send/stdin (JSON por linha).
'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

const MODEL_PATH = process.env.MODEL_PATH || path.join(__dirname, 'models', 'qwen3-0.6b-abliterated.gguf');
const NCORES = Math.max(1, os.cpus().length - 1);
const CONTEXT_SIZE = parseInt(process.env.LLM_CONTEXT_SIZE || '2048', 10);

let nodeLlamaCpp = null;
let llm = null;
let model = null;
let context = null;
let loading = false;
let currentSeq = null;
let abortGeneration = false;
let lastResult = 'uninitialized'; // uninitialized | ready | incompativel | erro
let lastErrorMsg = '';

const pending = {};

function send(msg) {
    try { if (process.connected) process.send(msg); } catch {}
}

function getStopTokenIds(mdl) {
    const patterns = ['<|im_end|>', '</s>'];
    const ids = new Set();
    for (const p of patterns) {
        try { for (const id of mdl.tokenize(p, true)) ids.add(id); } catch {}
    }
    return ids;
}

// Qwen3 costuma emitir raciocinio interno (chain-of-thought) antes da resposta
// final. O usuario nao deve ver esse raciocinio: detectamos o fim da
// "resposta final" pelo marcador proprio do modelo (uma linha isolada com
// "response" ou uma tag de fechamento de pensamento, ex.: </think>,
// <|/thinking|>) e mantemos apenas o que vem depois dele.
function hasAnswerMarker(text) {
    return /^[\s\S]*?\n\s*(?:resp\w*|<\/\|?[^>]*\|?>)[^\n]*\n/i.test(text);
}

function stripReasoning(text) {
    let t = String(text || '');
    // remove blocos de raciocinio delimitados por tokens (inicio + fechamento)
    t = t.replace(/<\|?thinking\|?>[\s\S]*?<\/\|?[^>]*\|?>/g, '');
    // remove tudo ate (inclusive) a linha-marcador da resposta final
    const m = t.match(/^[\s\S]*?\n\s*(?:resp\w*|<\/\|?[^>]*\|?>)[^\n]*\n/i);
    if (m) t = t.slice(m.index + m[0].length);
    else {
        // Sem marcador explicito (ex.: raciocinio curto demais ou truncado),
        // remove um preambulo de raciocinio inicial se houver quebra de paragrafo.
        const paras = t.split(/\n\s*\n/);
        if (paras.length > 1 && /^\s*(?:thinking|okay[,!]?|let me|first[,:]|the user|i need|so[,!]?|now[,:]|to answer|an?[ \t]+(?:ai|assistant))/i.test(paras[0].trim())) {
            const idx = paras.findIndex(p => !/^(?:okay|the user|let me|first[,:]|i need|so[,)]|now[,:]|[a-z]+:)/i.test(p.trim()) && /[a-zà-ú]/i.test(p));
            if (idx > 0) t = paras.slice(idx).join('\n\n');
        }
    }
    // limpa caracteres de substituicao (bytes invalidos do tokenizer)
    t = t.replace(/\uFFFD/g, '');
    return t.trim();
}

async function load() {
    if (loading) return { ok: false, status: 'loading' };
    if (lastResult === 'ready') return { ok: true, status: 'ready' };
    loading = true;
    try {
        if (!fs.existsSync(MODEL_PATH)) {
            lastResult = 'erro';
            lastErrorMsg = 'Modelo nao encontrado';
            return { ok: false, status: 'erro', message: lastErrorMsg };
        }
        // O binario do node-llama-cpp faz dispatch de CPU em runtime (usa os
        // kernels melhores disponiveis: AVX2/AVX/SSE). Nao bloquear previamente
        // por falta de AVX2 — o try/catch abaixo detecta incompatibilidade real
        // (SIGILL/instrucao ilegal) e o worker e um processo isolado, entao nem
        // mesmo um crash derrubaria o ERP.
        if (!nodeLlamaCpp) nodeLlamaCpp = await import('node-llama-cpp');
        // IMPORTANTE: forca somente CPU (gpu: false). Nesta maquina (i7-2600K sem
        // AVX2) o path 'auto' pode resolver para o backend Vulkan dentro do
        // Electron e executar instrucoes nao suportadas (SIGILL -> trava o PC).
        // O build de CPU ja faz dispatch seguro de AVX2/AVX/SSE em runtime.
        llm = await nodeLlamaCpp.getLlama({ gpu: false, logLevel: 'warn' });
        model = await llm.loadModel({ modelPath: MODEL_PATH });
        context = await model.createContext({ contextSize: CONTEXT_SIZE, batchSize: 256, threads: NCORES });
        lastResult = 'ready';
        lastErrorMsg = '';
        return { ok: true, status: 'ready' };
    } catch (error) {
        lastResult = String(error.message || '').toLowerCase().includes('avx') || /illegal|instruction|sse|avx/.test(String(error.message || ''))
            ? 'incompativel' : 'erro';
        lastErrorMsg = String(error.message || 'Erro desconhecido');
        return { ok: false, status: lastResult, message: lastErrorMsg };
    } finally {
        loading = false;
    }
}

async function generate(prompt, reqId) {
    try {
        if (lastResult !== 'ready') {
            const r = await load();
            if (!r.ok) {
                send({ type: 'done', reqId, texto: '', acao: null, erro: lastErrorMsg });
                return;
            }
        }
        if (!model || !context) throw new Error('Modelo nao carregado');

        // Reaproveita o bloco de contexto alocado (reset e bem mais barato do
        // que recriar a KV-cache via createContext a cada resposta).
        try { context.reset(); } catch {}

        abortGeneration = false;
        currentSeq = context.getSequence();
        const stopTokens = getStopTokenIds(model);
        const tokens = model.tokenize(prompt, true);
        let fullResponse = '';
        let answerStart = false;   // true a partir do 1o marcador de resposta
        let forwarded = '';        // texto ja enviado ao renderer (so a resposta)
        const genTokens = [];
        const maxTokens = 300;
        try {
            for await (const token of currentSeq.evaluate(tokens, {
                temperature: 0.4, topK: 40, topP: 0.85, minP: 0.1,
                repeatPenalty: { punishTokens: () => genTokens, penalty: 1.15, frequencyPenalty: 0.15, presencePenalty: 0.15 }
            })) {
                if (abortGeneration || stopTokens.has(token)) break;
                if (genTokens.length >= maxTokens) break;
                genTokens.push(token);
                const text = model.detokenize([token], false);
                fullResponse += text;
                if (!answerStart && hasAnswerMarker(fullResponse)) {
                    answerStart = true;
                }
                if (answerStart) {
                    const cleaned = stripReasoning(fullResponse).trim();
                    if (cleaned.length > forwarded.length) {
                        const delta = cleaned.slice(forwarded.length);
                        forwarded = cleaned;
                        if (delta) send({ type: 'token', reqId, text: delta });
                    }
                }
            }
        } catch (e) {
            // erro de geração não derruba o processo; tenta manter o modelo vivo.
            try { currentSeq?.dispose(); } catch {}
            currentSeq = null;
            if (context) {
                try { context.dispose(); } catch {}
                context = null;
            }
            if (model) {
                try { context = await model.createContext({ contextSize: CONTEXT_SIZE, batchSize: 256, threads: NCORES }); } catch { context = null; }
            }
            if (!model || !context) {
                model = null;
                lastResult = 'erro';
                lastErrorMsg = String(e.message || 'Erro de geracao');
            }
            const finalText = stripReasoning(fullResponse).trim();
            if (finalText && finalText !== forwarded) send({ type: 'token', reqId, text: finalText });
            send({ type: 'done', reqId, texto: finalText, acao: null, erro: String(e.message || 'Erro de geracao') });
            return;
        }

        const textoLimpo = stripReasoning(fullResponse).trim();
        if (textoLimpo && textoLimpo !== forwarded) send({ type: 'token', reqId, text: textoLimpo });
        send({ type: 'done', reqId, texto: textoLimpo, acao: null, erro: abortGeneration ? '[Interrompido]' : null });    } catch (error) {
        send({ type: 'done', reqId, texto: '', acao: null, erro: String(error.message || 'erro') });
    } finally {
        // Nao recria o contexto aqui: ele e reaproveitado via context.reset() na
        // proxima geracao, evitando o custo (alto em CPU fraca) de createContext.
        try { currentSeq?.dispose(); } catch {}
        currentSeq = null;
    }
}

function abort() {
    abortGeneration = true;
    try { currentSeq?.dispose(); } catch {}
    currentSeq = null;
    try { if (context) { context.dispose(); } } catch {}
    try { context = null; } catch {}
    send({ type: 'aborted' });
}

function unload() {
    try { context?.dispose(); } catch {}
    try { model?.dispose(); } catch {}
    context = null; model = null;
    lastResult = 'uninitialized'; lastErrorMsg = '';
    send({ type: 'unloaded' });
}

process.on('message', (m) => {
    if (!m || !m.type) return;
    if (m.type === 'init') {
        load().then(r => send({ type: 'init-result', reqId: m.reqId, ok: r.ok, status: r.status, message: r.message }));
    } else if (m.type === 'generate') {
        generate(m.prompt, m.reqId);
    } else if (m.type === 'abort') {
        abort();
    } else if (m.type === 'unload') {
        unload();
    } else if (m.type === 'status') {
        send({ type: 'status-result', reqId: m.reqId, status: lastResult, message: lastErrorMsg });
    }
});

process.on('uncaughtException', (err) => {
    send({ type: 'crash', message: String(err && err.message || err) });
});
process.on('unhandledRejection', (reason) => {
    send({ type: 'crash', message: String(reason && reason.message || reason) });
});

// Sinaliza prontidão do worker
send({ type: 'worker-ready' });
