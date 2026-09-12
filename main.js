const path = require('path');
const fs = require('fs');
const os = require('os');

// Carrega variaveis do .env (raiz do ERP) antes de inicializar qualquer modulo
process.env.NGR_ENV_FILE = path.join(__dirname, '.env');
try { require('dotenv').config({ path: process.env.NGR_ENV_FILE }); } catch (e) {}

process.env.GSETTINGS_BACKEND = 'memory';
process.env.LIBVA_DRIVER_NAME = 'i965';
process.env.DISABLE_WAYLAND = '1';

const stderrWrite = process.stderr.write.bind(process.stderr);
const knownWarnings = ['[node-llama-cpp] load:', 'load: control-looking token', 'libva error:', 'dbind-WARNING', 'GLib-GObject:', 'browser_main_loop', 'GPU process launch failed', 'Network service crashed', 'atom_cache.cc', 'xshm', 'swrast'];
process.stderr.write = (buf, ...args) => {
    const str = buf.toString();
    for (const w of knownWarnings) { if (str.includes(w)) return true; }
    return stderrWrite(buf, ...args);
};

let app, BrowserWindow, ipcMain, dialog;

try {
    const electron = require('electron');
    app = electron.app;
    BrowserWindow = electron.BrowserWindow;
    ipcMain = electron.ipcMain;
    dialog = electron.dialog;
} catch {
    console.log('[NGR] Electron nao encontrado. Execute: npx electron .');
    process.exit(1);
}

// Desativa aceleracao de hardware antes do app.whenReady() para silenciar o
// log inofensivo de "libva error" (decodificacao VAAPI) em GPUs integradas no
// Linux e reduzir o consumo de CPU em maquinas modestas.
if (app && typeof app.disableHardwareAcceleration === 'function') {
    app.disableHardwareAcceleration();
}

const MODEL_PATH = process.env.MODEL_PATH || path.join(__dirname, 'models', 'qwen3-0.6b-abliterated.gguf');
const USER_DATA_DIR = path.join(app.getPath('userData'));
const DOCS_DIR = path.join(USER_DATA_DIR, 'documentos');

const NCORES = Math.max(1, os.cpus().length - 1);
const CONTEXT_SIZE = parseInt(process.env.LLM_CONTEXT_SIZE || '2048', 10);
const LLM_IDLE_TIMEOUT = 5 * 60 * 1000;
// Tempo maximo de uma geracao como rede de seguranca do backend (maior que o
// timeout de 30s do front, para dar tempo de streaming, mas nunca pendurar).
const LLM_GEN_TIMEOUT = 120000;

// ===== NGR BOT (módulo WhatsApp) =====
const NGRBOT_DIR = path.join(__dirname, 'resources', 'ngrbot');
const NGRBOT_PORT = 3000;
let ngrbotProcess = null;
let ngrbotReady = false;

function httpProbePort(port, timeoutMs) {
    return new Promise((resolve) => {
        const http = require('http');
        const req = http.get({ host: '127.0.0.1', port, timeout: timeoutMs }, (res) => {
            res.resume();
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => { req.destroy(); resolve(false); });
    });
}

function startNgrbot() {
    if (ngrbotProcess || ngrbotReady) return;
    const serverPath = path.join(NGRBOT_DIR, 'server.js');
    if (!fs.existsSync(serverPath)) {
        console.error('[NGRBOT] server.js nao encontrado em', serverPath);
        mainWindow?.webContents?.send('ngrbot-status', { running: false, port: NGRBOT_PORT, error: 'server.js nao encontrado' });
        return;
    }
    httpProbePort(NGRBOT_PORT, 800).then((online) => {
        if (online) {
            ngrbotReady = true;
            try { mainWindow?.webContents?.send('ngrbot-status', { running: true, port: NGRBOT_PORT }); } catch {}
            return;
        }
        const { spawn } = require('child_process');
        ngrbotProcess = spawn('node', [serverPath], {
            cwd: NGRBOT_DIR,
            env: { ...process.env, PORT: String(NGRBOT_PORT), NODE_ENV: 'development' },
            stdio: 'pipe'
        });
        ngrbotProcess.stdout.on('data', (d) => {
            const line = d.toString().trim();
            if (line) console.log('[NGRBOT]', line);
            if (line.includes('localhost:' + NGRBOT_PORT) || /Servidor:.*localhost/i.test(line)) {
                ngrbotReady = true;
                mainWindow?.webContents?.send('ngrbot-status', { running: true, port: NGRBOT_PORT });
            }
        });
        ngrbotProcess.stderr.on('data', (d) => {
            const line = d.toString().trim();
            if (line) console.error('[NGRBOT ERR]', line);
        });
        ngrbotProcess.on('exit', (code) => {
            console.log('[NGRBOT] processo encerrado (codigo', code + ')');
            ngrbotProcess = null;
            ngrbotReady = false;
        });
        ngrbotProcess.on('error', (err) => {
            console.error('[NGRBOT] erro ao iniciar:', err.message);
            ngrbotProcess = null;
        });
    });
}

function stopNgrbot() {
    if (ngrbotProcess) {
        try { ngrbotProcess.kill('SIGTERM'); } catch {}
        ngrbotProcess = null;
    }
    ngrbotReady = false;
}

ipcMain.handle('ngrbot-open', () => { startNgrbot(); return true; });
ipcMain.handle('ngrbot-status', () => ({ running: ngrbotReady, port: NGRBOT_PORT }));

// Bridge de config do WhatsApp: grava config.runtime.json que o NGRBOT (processo separado) le.
// O ERP (renderer) e a fonte das configuracoes (Minha Conta); o JSON e o canal leve entre os dois.
const NGRBOT_RUNTIME_CONFIG = path.join(NGRBOT_DIR, 'config.runtime.json');

ipcMain.handle('ngrbot-config-update', async (event, data) => {
    try {
        const cfg = Object.assign({}, data || {});
        fs.writeFileSync(NGRBOT_RUNTIME_CONFIG, JSON.stringify(cfg, null, 2), 'utf8');
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('ngrbot-config-get', () => {
    try {
        if (!fs.existsSync(NGRBOT_RUNTIME_CONFIG)) return {};
        return JSON.parse(fs.readFileSync(NGRBOT_RUNTIME_CONFIG, 'utf8') || '{}');
    } catch {
        return {};
    }
});

let mainWindow = null;
let llmWorker = null;       // processo filho isolado (node-llama-cpp)
let llmWorkerReady = false;
let llmIncompativel = false;
let llmLoaded = false;
let llmStatusMsg = 'uninitialized';
let initProm = null;
let genPending = null;      // { win, text, reqId, aborted }
let genTimeout = null;      // watchdog: jamais deixa a geracao pendurada
let abortGeneration = false;
let idleTimer = null;

// Força build universal (sem AVX/AVX2) quando buildando do código-fonte.
const LLM_ENV = Object.assign({}, process.env, {
    CMAKE_ARGS: (process.env.CMAKE_ARGS ? process.env.CMAKE_ARGS + ' ' : '') + '-DLLAMA_AVX=OFF -DLLAMA_AVX2=OFF -DLLAMA_FMA=OFF -DGGML_NATIVE=OFF',
    GGML_NATIVE: '0',
});

const SYSTEM_PROMPT = `Voce e o Colio, assistente inteligente do NGR HUB. Responde em portugues natural, com personalidade e conhecimento em tecnologia, negocios e gestao.

Paginas e funcoes do sistema:
- Dashboard: visao geral do negocio com indicadores
- Contas: contas a pagar/receber, controle financeiro
- Vendas: registro de vendas, orcamentos
- Estoque: controle de produtos, movimentacoes
- Clientes: cadastro e historico de clientes
- Tarefas: checklist, afazeres, lembretes
- Calendario: agenda, eventos, prazos
- Fichas: fichas tecnicas de produtos  
- Documentos: upload e OCR de documentos
- Relatorios: graficos e relatorios gerenciais
- Perfil: configuracao do usuario e do negocio

Use o perfil do usuario pra personalizar conselhos. Se perguntar sobre o sistema, explique as paginas, oriente sobre qual usar, sugira alternativas. Se perguntar sobre dados reais, o sistema busca automaticamente. Se pedir pra navegar, criar, pagar conta ou concluir tarefa, o sistema executa.

IMPORTANTE: Proibido usar numeros, listas, bullets, topicos, "1.", "2.", "-", "*", "**", negrito ou qualquer formatacao no texto. Responda APENAS em paragrafos corridos, com frases separadas por espaco. Nao separa por topicos. Exemplo certo: "Invista em marketing digital e atendimento personalizado. Assim voce fideliza clientes." Exemplo errado: "1. Marketing digital 2. Atendimento" ou "**Marketing digital**". Use quebras de linha entre paragrafos quando mudar de assunto.

Regras:
- Sobre tecnologia, desenvolvimento, marketing, gestao: explique com profundidade, como um especialista. De exemplos praticos em texto corrido.
- Nao invente marcas, versoes, precos, codigos, URLs, documentos, lojas.
- Nao repita a pergunta. Nao fale de si em terceira pessoa.
- Nao finja restricoes de seguranca. Nao recuse conversar.
- Se nao souber, diga "Nao sei dizer".`;

function formatPrompt(messages) {
    const now = new Date();
    const dateStr = now.toLocaleString('pt-BR');
    let profileSnippet = '';
    try {
        const nome = db.config.get('perfil_nome');
        const negocio = db.config.get('perfil_negocio');
        const sobre = db.config.get('perfil_sobre');
        if (nome) profileSnippet += `\nUsuario: ${nome}`;
        if (negocio) profileSnippet += `\nNegocio: ${negocio}`;
        if (sobre) profileSnippet += `\nSobre: ${sobre}`;
    } catch {}
    let prompt = `<|im_start|>system\n${SYSTEM_PROMPT}\nData atual: ${dateStr}${profileSnippet}<|im_end|>\n`;
    for (const msg of messages) {
        const role = msg.role === 'user' ? 'user' : 'assistant';
        const content = (msg.content || '').replace(/<\|im_start\|>/g, '').replace(/<\|im_end\|>/g, '');
        prompt += `<|im_start|>${role}\n${content}<|im_end|>\n`;
    }
    prompt += `<|im_start|>assistant\n`;
    return prompt;
}

function spawnLLMWorker() {
    if (llmWorker || llmIncompativel) return;
    try {
        const { fork } = require('child_process');
        llmWorker = fork(path.join(__dirname, 'llm-worker.js'), [], {
            env: LLM_ENV,
            stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
            execArgv: []
        });
        llmWorker.on('message', onLLMWorkerMessage);
        llmWorker.on('error', (err) => {
            console.error('[LLM] worker error:', err.message);
            llmWorker = null; llmIncompativel = true; llmLoaded = false;
            notifyLLMUnavailable();
        });
        llmWorker.on('exit', (code, signal) => {
            // Morte do worker (ex.: SIGILL por CPU antiga) NUNCA deve derrubar o ERP.
            llmWorker = null; llmWorkerReady = false; llmLoaded = false;
            const morte = signal ? ' (' + (signal === 'SIGILL' ? 'instrucao ilegal - CPU incompativel' : signal) + ')' : ' codigo ' + code;
            console.error('[LLM] worker encerrado' + morte);
            notifyLLMUnavailable('Modulo de IA indisponivel neste hardware.' + (signal === 'SIGILL' ? ' CPU nao suporta este binario.' : ''));
        });
    } catch (err) {
        console.error('[LLM] nao foi possivel iniciar worker:', err.message);
        llmIncompativel = true;
        notifyLLMUnavailable();
    }
}

function notifyLLMUnavailable(msg) {
    llmLoaded = false;
    const texto = msg || 'Modulo de IA indisponivel (hardware incompativel ou falha nativa).';
    if (genPending) {
        const w = genPending.win;
        genPending = null;
        try { if (w && !w.isDestroyed()) w.webContents.send('generate-error', texto); } catch {}
    }
    if (initProm) { const p = initProm; initProm = null; p.resolve({ ok: false, status: 'incompativel', message: texto }); }
    if (mainWindow && !mainWindow.isDestroyed()) {
        try { mainWindow.webContents.send('model-status', texto); } catch {}
    }
}

function onLLMWorkerMessage(m) {
    if (!m || !m.type) return;
    if (m.type === 'init-result') {
        llmLoaded = !!m.ok && m.status === 'ready';
        llmIncompativel = m.status === 'incompativel';
        let s = 'Erro: ' + (m.message || '');
        if (m.status === 'ready') s = 'Pronto';
        else if (m.status === 'incompativel') s = 'Hardware incompativel para o modulo de IA: ' + (m.message || 'CPU antiga');
        llmStatusMsg = s;
        const p = initProm; initProm = null;
        if (p) p.resolve({ ok: !!m.ok, status: m.status, message: s });
        if (mainWindow && !mainWindow.isDestroyed()) {
            try { mainWindow.webContents.send('model-status', s); } catch {}
        }
    } else if (m.type === 'token') {
        if (genPending) {
            // tokens chegando => stream vivo; renova o watchdog
            clearTimeout(genTimeout);
            genTimeout = setTimeout(() => {
                if (!genPending) return;
                const gp = genPending; genPending = null;
                try { llmWorker?.send({ type: 'abort' }); } catch {}
                try { gp.win.webContents.send('generate-error', 'O agente demorou para responder, tente novamente.'); } catch {}
            }, LLM_GEN_TIMEOUT);
            genPending.text += m.text || '';
            try { if (!genPending.win.isDestroyed()) genPending.win.webContents.send('llm-token', m.text); } catch {}
        }
    } else if (m.type === 'done') {
        clearTimeout(genTimeout); genTimeout = null;
        const gp = genPending; genPending = null;
        if (gp) {
            const win = gp.win;
            const textoLimpo = (m.texto || '').trim();
            try {
                if (gp.aborted || m.erro === '[Interrompido]') {
                    win.webContents.send('llm-done', { texto: '[Interrompido]', acao: null });
                } else if (m.erro) {
                    win.webContents.send('generate-error', m.erro);
                } else if (!textoLimpo) {
                    win.webContents.send('llm-done', { texto: 'Nao foi possivel gerar resposta.', acao: null });
                } else {
                    const comando = parseComando(textoLimpo);
                    win.webContents.send('llm-done', { texto: comando ? textoLimpo.replace(/\{[\s\S]*?"acao"[\s\S]*?\}/, '').trim() || 'Pronto!' : textoLimpo, acao: comando });
                }
            } catch {}
        }
    } else if (m.type === 'crash') {
        clearTimeout(genTimeout); genTimeout = null;
        llmIncompativel = true;
        llmWorker = null; llmLoaded = false;
        notifyLLMUnavailable('Modulo de IA encerrado (hardware/erro): ' + (m.message || ''));
    }
}

async function loadModel(win) {
    if (llmIncompativel) {
        if (win && !win.isDestroyed()) win.webContents.send('model-status', 'Hardware incompativel para o modulo de IA');
        return false;
    }
    if (llmLoaded) {
        if (win && !win.isDestroyed()) win.webContents.send('model-status', 'Pronto');
        return true;
    }
    spawnLLMWorker();
    if (!llmWorker) { notifyLLMUnavailable(); return false; }
    if (win && !win.isDestroyed()) win.webContents.send('model-status', 'Carregando modelo...');
    const reqId = (Math.random() * 1e9) | 0;
    const p = new Promise(res => { initProm = { resolve: res, id: reqId }; });
    llmWorker.send({ type: 'init', reqId });
    const result = await Promise.race([
        p,
        new Promise(res => setTimeout(() => res({ ok: false, status: 'erro', message: 'Timeout ao carregar modulo de IA' }), 120000))
    ]);
    llmLoaded = !!result.ok;
    if (win && !win.isDestroyed()) win.webContents.send('model-status', result.message || (result.ok ? 'Pronto' : 'Erro'));
    if (result.status === 'incompativel') llmIncompativel = true;
    return !!result.ok;
}

async function generateResponse(messages, win) {
    try {
        if (!llmLoaded) {
            const loaded = await loadModel(win);
            if (!loaded) {
                if (win && !win.isDestroyed()) win.webContents.send('generate-error', 'Modulo de IA indisponivel neste hardware.');
                return { success: false, error: 'Modulo de IA indisponivel neste hardware.' };
            }
        }
        resetIdleTimer();
        abortGeneration = false;
        const reqId = (Math.random() * 1e9) | 0;
        const prompt = formatPrompt(messages);
        if (!llmWorker) { spawnLLMWorker(); }
        if (!llmWorker) { notifyLLMUnavailable(); return { success: false, error: 'Modulo de IA indisponivel.' }; }
        genPending = { win, text: '', reqId, aborted: false };

        // Watchdog: se o worker nao responder em LLM_GEN_TIMEOUT, aborta e
        // informa o renderer — a rota/requisicao nunca fica pendurada.
        clearTimeout(genTimeout);
        genTimeout = setTimeout(() => {
            if (!genPending || genPending.reqId !== reqId) return;
            const gp = genPending; genPending = null;
            try { llmWorker?.send({ type: 'abort' }); } catch {}
            try { gp.win.webContents.send('generate-error', 'O agente demorou para responder, tente novamente.'); } catch {}
        }, LLM_GEN_TIMEOUT);

        llmWorker.send({ type: 'generate', prompt, reqId });
        return { success: true };
    } catch (err) {
        console.error('[LLM] generateResponse error:', err.message);
        return { success: false, error: String(err && err.message || 'Erro ao gerar resposta') };
    }
}

function parseComando(texto) {
    try {
        const jsonMatch = texto.match(/\{[\s\S]*?"acao"[\s\S]*?\}/);
        if (!jsonMatch) return null;
        return JSON.parse(jsonMatch[0]);
    } catch { return null; }
}

function unloadModel() {
    try { if (llmWorker) llmWorker.send({ type: 'unload' }); } catch {}
    llmLoaded = false;
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('model-status', 'Descarregado');
}

function resetIdleTimer() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    idleTimer = setTimeout(() => {
        if (llmLoaded) { unloadModel(); }
    }, LLM_IDLE_TIMEOUT);
}

async function ocrDocument(filePath) {
    const { spawnSync } = require('child_process');
    const ext = path.extname(filePath).toLowerCase();

    if (ext === '.txt' || ext === '.csv') {
        return fs.readFileSync(filePath, 'utf-8').slice(0, 10000);
    }

    if (ext === '.pdf') {
        try {
            const proc = spawnSync('pdftotext', [filePath, '-'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 15000 });
            if (proc.status === 0) return proc.stdout.toString('utf-8').slice(0, 10000);
        } catch {}
        try {
            const pdfParse = require('pdf-parse');
            const buf = fs.readFileSync(filePath);
            const data = await pdfParse(buf);
            return data.text ? data.text.slice(0, 10000) : '';
        } catch { return '[PDF: nao foi possivel extrair texto]'; }
    }

    const imgExts = ['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp'];
    if (imgExts.includes(ext)) {
        try {
            const proc = spawnSync('tesseract', [filePath, 'stdout', '-l', 'por'], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
            if (proc.status === 0) return proc.stdout.toString('utf-8').trim().slice(0, 10000);
        } catch {}
        try {
            const tesseract = require('tesseract.js');
            const { data } = await tesseract.recognize(filePath, 'por');
            return data.text ? data.text.slice(0, 10000) : '';
        } catch { return '[OCR: sem texto extraido]'; }
    }
    return '';
}

function getDocsDir() {
    if (!fs.existsSync(DOCS_DIR)) fs.mkdirSync(DOCS_DIR, { recursive: true });
    return DOCS_DIR;
}

const db = require('./database/db');
const nfeService = require('./services/nfe');
const printService = require('./services/print');

ipcMain.handle('init-db', async () => {
    try { await db.init(); return { success: true }; }
    catch (e) { return { success: false, error: e.message }; }
});


ipcMain.handle('llm-generate', async (event, { messages }) => {
    try {
        const res = await generateResponse(messages, mainWindow);
        return res && res.success === false ? res : { success: true };
    } catch (err) {
        console.error('[IPC] llm-generate:', err.message);
        return { success: false, error: String(err.message || 'Erro ao gerar resposta') };
    }
});
ipcMain.handle('llm-abort', () => {
    clearTimeout(genTimeout); genTimeout = null;
    const gp = genPending; genPending = null; abortGeneration = true;
    if (gp) gp.aborted = true;
    try { if (llmWorker) llmWorker.send({ type: 'abort' }); } catch {}
    return true;
});

const STT_REC = { proc: null };

ipcMain.handle('stt-start', async () => {
    try {
        if (STT_REC.proc) { STT_REC.proc.kill(); STT_REC.proc = null; }
        const { spawn } = require('child_process');
        STT_REC.proc = spawn('arecord', ['-f', 'S16_LE', '-r', '16000', '-c', '1', '/tmp/ngr_stt.wav']);
        return { success: true };
    } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('stt-stop', async () => {
    try {
        if (STT_REC.proc) { STT_REC.proc.kill('SIGINT'); STT_REC.proc = null; }
        if (!fs.existsSync('/tmp/ngr_stt.wav')) return { success: true, text: '' };
        const { spawn } = require('child_process');
        const scriptPath = path.join(__dirname, 'scripts', 'stt.py');
        const text = await new Promise((resolve) => {
            const proc = spawn('python3', [scriptPath, '/tmp/ngr_stt.wav', 'pt']);
            let result = '';
            proc.stdout.on('data', d => result += d.toString());
            proc.stderr.on('data', () => {});
            proc.on('close', () => {
                try { resolve(JSON.parse(result).text || ''); } catch { resolve(''); }
            });
        });
        return { success: true, text };
    } catch (e) { return { success: false, error: e.message, text: '' }; }
});

ipcMain.handle('db-contas-list', (e, filtro) => db.contas.list(filtro || {}));
ipcMain.handle('db-contas-create', (e, dados) => { const id = db.contas.create(dados); return db.contas.get(id); });
ipcMain.handle('db-contas-update', (e, { id, dados }) => { db.contas.update(id, dados); return db.contas.get(id); });
ipcMain.handle('db-contas-remove', (e, id) => { db.contas.remove(id); return { success: true }; });
ipcMain.handle('db-contas-get', (e, id) => db.contas.get(id));
ipcMain.handle('db-contas-pagar', (e, { id, data }) => { db.contas.pagar(id, data); return db.contas.get(id); });
ipcMain.handle('db-contas-resumo', () => db.contas.resumo());

ipcMain.handle('db-tarefas-list', (e, filtro) => db.tarefas.list(filtro || {}));
ipcMain.handle('db-tarefas-create', (e, dados) => { const id = db.tarefas.create(dados); return db.tarefas.get(id); });
ipcMain.handle('db-tarefas-update', (e, { id, dados }) => { db.tarefas.update(id, dados); return db.tarefas.get(id); });
ipcMain.handle('db-tarefas-remove', (e, id) => { db.tarefas.remove(id); return { success: true }; });
ipcMain.handle('db-tarefas-get', (e, id) => db.tarefas.get(id));

ipcMain.handle('db-fichas-list', (e, filtro) => db.fichas.list(filtro || {}));
ipcMain.handle('db-fichas-create', (e, dados) => { const id = db.fichas.create(dados); return db.fichas.get(id); });
ipcMain.handle('db-fichas-update', (e, { id, dados }) => { db.fichas.update(id, dados); return db.fichas.get(id); });
ipcMain.handle('db-fichas-remove', (e, id) => { db.fichas.remove(id); return { success: true }; });
ipcMain.handle('db-fichas-get', (e, id) => db.fichas.get(id));

ipcMain.handle('db-docs-list', (e, filtro) => db.documentos.list(filtro || {}));
ipcMain.handle('db-docs-remove', (e, id) => {
    const doc = db.documentos.get(id);
    if (doc) try { fs.unlinkSync(doc.caminho); } catch {}
    db.documentos.remove(id);
    return { success: true };
});
ipcMain.handle('db-docs-upload', async (e, { referencia_tipo, referencia_id }) => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'txt', 'csv'] }]
    });
    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };
    const srcPath = result.filePaths[0];
    const nomeOriginal = path.basename(srcPath);
    const ext = path.extname(nomeOriginal);
    const nomeArquivo = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
    const docsDir = getDocsDir();
    const destPath = path.join(docsDir, nomeArquivo);
    fs.copyFileSync(srcPath, destPath);
    const stats = fs.statSync(destPath);
    const id = db.documentos.create({
        nome_original: nomeOriginal, nome_arquivo: nomeArquivo,
        tipo: ext.replace('.', '') || 'bin', tamanho: stats.size,
        caminho: destPath, referencia_tipo: referencia_tipo || null, referencia_id: referencia_id || null
    });
    return { success: true, doc: db.documentos.get(id) };
});
ipcMain.handle('db-docs-download', async (e, id) => {
    const doc = db.documentos.get(id);
    if (!doc || !fs.existsSync(doc.caminho)) return { success: false, error: 'Arquivo nao encontrado' };
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: doc.nome_original,
        filters: [{ name: 'Documentos', extensions: [doc.tipo] }]
    });
    if (result.canceled) return { success: false, canceled: true };
    fs.copyFileSync(doc.caminho, result.filePath);
    return { success: true };
});

ipcMain.handle('db-docs-preview', (e, id) => {
    const doc = db.documentos.get(id);
    if (!doc || !fs.existsSync(doc.caminho)) return { success: false, error: 'Arquivo nao encontrado' };
    const ext = (doc.tipo || '').toLowerCase();
    try {
        const imgExts = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'];
        if (imgExts.includes(ext)) {
            const buf = fs.readFileSync(doc.caminho);
            return { success: true, tipo: 'imagem', data: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}` };
        }
        if (ext === 'pdf') {
            const buf = fs.readFileSync(doc.caminho);
            return { success: true, tipo: 'pdf', data: `data:application/pdf;base64,${buf.toString('base64')}` };
        }
        if (ext === 'txt' || ext === 'csv') {
            const texto = fs.readFileSync(doc.caminho, 'utf-8').slice(0, 20000);
            return { success: true, tipo: 'texto', data: texto };
        }
        return { success: true, tipo: 'arquivo', data: null };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('db-eventos-list', (e, filtro) => db.eventos.list(filtro || {}));
ipcMain.handle('db-eventos-create', (e, dados) => { const id = db.eventos.create(dados); return db.eventos.get(id); });
ipcMain.handle('db-eventos-remove', (e, id) => { db.eventos.remove(id); return { success: true }; });
ipcMain.handle('db-eventos-update', (e, { id, dados }) => { db.eventos.update(id, dados); return db.eventos.get(id); });

ipcMain.handle('db-categorias-list', (e, tipo) => db.categorias.list(tipo));

ipcMain.handle('db-conversas-list', () => db.conversas.list());
ipcMain.handle('db-conversas-create', async () => { const id = await db.conversas.create(); return db.conversas.get(id); });
ipcMain.handle('db-conversas-get', (e, id) => db.conversas.get(id));
ipcMain.handle('db-conversas-remove', async (e, id) => { await db.conversas.remove(id); return { success: true }; });
ipcMain.handle('db-conversas-mensagens', (e, id) => db.conversas.mensagens(id));
ipcMain.handle('db-conversas-add-msg', (e, { conversa_id, papel, conteudo }) => {
    db.conversas.addMensagem(conversa_id, papel, conteudo);
    db.conversas.update(conversa_id, { updated_at: new Date().toISOString() });
    return { success: true };
});

ipcMain.handle('db-fornecedores-list', (e, f) => db.fornecedores.list(f || {}));
ipcMain.handle('db-fornecedores-create', (e, d) => db.fornecedores.create(d));
ipcMain.handle('db-fornecedores-update', (e, { id, dados }) => db.fornecedores.update(id, dados));
ipcMain.handle('db-fornecedores-remove', (e, id) => { db.fornecedores.remove(id); return { success: true }; });
ipcMain.handle('db-fornecedores-get', (e, id) => db.fornecedores.get(id));

ipcMain.handle('db-produtos-list', (e, f) => db.produtos.list(f || {}));
ipcMain.handle('db-produtos-create', (e, d) => db.produtos.create(d));
ipcMain.handle('db-produtos-update', (e, { id, dados }) => db.produtos.update(id, dados));
ipcMain.handle('db-produtos-remove', (e, id) => { db.produtos.remove(id); return { success: true }; });
ipcMain.handle('db-produtos-get', (e, id) => db.produtos.get(id));
ipcMain.handle('db-produtos-historico', (e, { id, meses }) => db.produtos.historico_vendas(id, meses));
ipcMain.handle('db-produtos-movimentar', (e, { id, tipo, qtd, obs, doc }) => db.produtos.movimentar(id, tipo, qtd, obs, doc));
ipcMain.handle('db-produtos-movimentos', (e, id) => db.produtos.movimentos(id));

ipcMain.handle('db-clientes-list', (e, f) => db.clientes.list(f || {}));
ipcMain.handle('db-clientes-create', (e, d) => db.clientes.create(d));
ipcMain.handle('db-clientes-update', (e, { id, dados }) => db.clientes.update(id, dados));
ipcMain.handle('db-clientes-remove', (e, id) => { db.clientes.remove(id); return { success: true }; });
ipcMain.handle('db-clientes-get', (e, id) => db.clientes.get(id));
ipcMain.handle('db-clientes-top', (e, l) => db.clientes.top(l || 10));

ipcMain.handle('db-vendas-list', (e, f) => db.vendas.list(f || {}));
ipcMain.handle('db-vendas-create', (e, d) => db.vendas.create(d));
ipcMain.handle('db-vendas-get', (e, id) => db.vendas.get(id));
ipcMain.handle('db-vendas-update', (e, { id, dados }) => db.vendas.update(id, dados));
ipcMain.handle('db-vendas-remove', (e, id) => db.vendas.remove(id));
ipcMain.handle('db-vendas-itens', (e, id) => db.vendas.itens(id));
ipcMain.handle('db-vendas-add-item', (e, { venda_id, produto_id, qtd, preco }) => db.vendas.addItem(venda_id, produto_id, qtd, preco));
ipcMain.handle('db-vendas-remove-item', (e, { id, venda_id }) => db.vendas.removeItem(id, venda_id));
ipcMain.handle('db-vendas-finalizar', (e, { id, pagamento }) => db.vendas.finalizar(id, pagamento));
ipcMain.handle('db-vendas-resumo', (e, meses) => db.vendas.resumo(meses || 3));

// NFe (emissão via API externa, retorno do DANFE) e Impressão universal
ipcMain.handle('nfe-emitir', async (e, vendaId) => {
    try { return await nfeService.emitirNFe(vendaId, db); }
    catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('imprimir-pdf', async (e, options) => {
    try { return await printService.printDataUrl(options.dataUrl, options); }
    catch (err) { return { success: false, error: err.message }; }
});
ipcMain.handle('imprimir-html', async (e, options) => {
    try { return await printService.printHTML(options.html, options); }
    catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('db-precificacao-list', (e, pid) => db.precificacao.list(pid));
ipcMain.handle('db-precificacao-create', (e, d) => db.precificacao.create(d));
ipcMain.handle('db-precificacao-remove', (e, id) => { db.precificacao.remove(id); return { success: true }; });
ipcMain.handle('db-precificacao-calcular', (e, produto) => {
    try { return db.precificacao.calcularPrecoSugerido(produto || {}); }
    catch (err) { console.error('[IPC] db-precificacao-calcular:', err.message); return { success: false, error: err.message }; }
});

ipcMain.handle('db-previsao-list', (e, tipo) => db.previsao.list(tipo));
ipcMain.handle('db-previsao-demanda', (e, { produto_id, periodos }) => db.previsao.preverDemanda(produto_id, periodos));
ipcMain.handle('db-previsao-financeiro', (e, { tipo, periodos }) => db.previsao.preverFinanceiro(tipo, periodos));

ipcMain.handle('db-config-get', (e, chave) => db.config.get(chave));
ipcMain.handle('db-config-set', (e, { chave, valor }) => { db.config.set(chave, valor); return { success: true }; });
ipcMain.handle('db-config-getAll', () => db.config.getAll());

// Licença local: trial 10 dias, plano, recarga 30 dias, conta master, chave Groq
ipcMain.handle('db-licence-status', () => {
    db.licence.ensureInstall();
    return db.licence.getStatus();
});
ipcMain.handle('db-licence-master', (e, { email, senha }) => {
    const ok = db.licence.unlockMaster(email, senha);
    return { success: ok, ...db.licence.getStatus() };
});
ipcMain.handle('db-licence-groq', (e, { chave }) => {
    db.licence.setGroqKey(chave);
    return { success: true };
});

// Verificação de pagamento via ngrbot (antifraude: não ativa sem confirmação server-side)
ipcMain.handle('db-licence-verify-and-activate', async (e, { plano, email }) => {
    db.licence.ensureInstall();

    // 1. Verificar com ngrbot local (localhost:3000) se pagamento foi confirmado
    try {
        const http = require('http');
        const installId = db.licence.getInstallId();
        const url = `http://127.0.0.1:3000/api/subscription/internal/status?email=${encodeURIComponent(email || '')}&installId=${encodeURIComponent(installId || '')}`;
        const response = await new Promise((resolve, reject) => {
            const req = http.get(url, { timeout: 5000 }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); }
                    catch { reject(new Error('Resposta invalida do servidor')); }
                });
            });
            req.on('error', (err) => reject(err));
            req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        });

        // 2. Pagamento confirmado pelo servidor → ativar localmente (30 dias)
        //    A recarga é aplicada com MAC local; o arquivo fica protegido contra
        //    edição manual (qualquer alteração quebra o MAC).
        if (response.active && response.planType && response.planType !== 'master') {
            const result = db.licence.ativarRecargaServidor(response.planType);
            if (result.ok) {
                console.log(`[LICENCA] Ativado via verificacao do ngrbot: plano=${result.plano}, ate=${result.validUntil}`);
                return { success: true, ...result, verified: true };
            }
            console.error(`[LICENCA] Falha ao ativar: ${result.error}`);
            return { success: false, error: result.error || 'Erro ao ativar licença' };
        }

        // 3. Admin — acesso permanente
        if (response.isAdmin) {
            return { success: true, ...db.licence.getStatus(), verified: true };
        }

        // 4. Trial ativo
        if (response.status === 'trial') {
            return { success: true, ...db.licence.getStatus(), verified: true, isTrial: true };
        }

        // 5. Pagamento não confirmado — NÃO ativar
        console.log(`[LICENCA] Pagamento NAO verificado: status=${response.status}, plano=${plano}`);
        return { success: false, error: 'Pagamento ainda não confirmado', status: response.status };
    } catch (error) {
        // 6. Servidor offline — NÃO ativar (segurança: não bypassar sem verificação)
        console.log(`[LICENCA] Servidor ngrbot offline, verificacao impossivel: ${error.message}`);
        return { success: false, error: 'Servidor de verificação offline. Pagamento não confirmado.' };
    }
});

ipcMain.handle('db-docs-update', (e, { id, dados }) => { db.documentos.update(id, dados); return db.documentos.get(id); });

ipcMain.handle('db-docs-ocr', async (e, id) => {
    const doc = db.documentos.get(id);
    if (!doc) return { success: false, error: 'Documento nao encontrado' };
    if (!fs.existsSync(doc.caminho)) return { success: false, error: 'Arquivo nao encontrado' };
    try {
        const texto = await ocrDocument(doc.caminho);
        db.documentos.update(id, { ocr_texto: texto });
        return { success: true, texto };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('llm-load-model', async () => {
    await loadModel(mainWindow);
    return { success: llmLoaded };
});
ipcMain.handle('llm-unload-model', () => { unloadModel(); return { success: true }; });

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1360, height: 820, minWidth: 1000, minHeight: 650,
        frame: true, backgroundColor: '#0a0a0f',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false, contextIsolation: true, sandbox: false,
            webviewTag: true
        }
    });
    mainWindow.loadFile(path.join(__dirname, 'frontend', 'index.html'));
    mainWindow.on('closed', () => { mainWindow = null; cleanup(); });
    mainWindow.webContents.on('did-finish-load', () => {
        setTimeout(async () => {
            await db.init();
            // Sincronizacao cross-module: qualquer escrita no banco notifica o
            // renderer, que re-renderiza os modulos dependentes automaticamente.
            db.events.removeAllListeners('change');
            db.events.on('change', (table) => {
                try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('db-changed', table); } catch {}
            });
            mainWindow.webContents.send('db-ready');
            loadModel(mainWindow);
        }, 300);
    });
}

 function cleanup() {
    try { if (llmWorker) { llmWorker.send({ type: 'unload' }); llmWorker.kill(); } } catch {}
    try { db.save(); } catch {}
}

process.on('uncaughtException', (err) => {
    console.error('[FATAL]', err.message);
    try { mainWindow?.webContents?.send('generate-error', 'Erro interno: ' + err.message); } catch {}
});

app.whenReady().then(() => {
    createWindow();
    startNgrbot();
});
app.on('window-all-closed', () => { cleanup(); stopNgrbot(); app.quit(); });
app.on('will-quit', () => { stopNgrbot(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
process.on('exit', () => cleanup());
process.on('SIGINT', () => { stopNgrbot(); process.exit(0); });
process.on('SIGTERM', () => { stopNgrbot(); process.exit(0); });
