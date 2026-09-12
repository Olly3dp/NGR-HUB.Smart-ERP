// Serviço de emissão de Nota Fiscal Eletrônica (NFe) — genérico/externo.
// Monta o payload a partir de uma venda local e envia para uma API externa
// configurada (NF-e SaaS), recebendo o DANFE (PDF) como retorno.
// Sem dependências externas (usa apenas http/https nativos) para manter o pacote leve.
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

function getConfig(db) {
    const c = db.config || {};
    return {
        // Ex.: https://api.meufornecedor.com.br/v1/nfe
        baseUrl: c.get('nfe_api_url') || '',
        apiKey: c.get('nfe_api_key') || '',
        emitente: {
            nome: c.get('nfe_emit_nome') || '',
            cpfCnpj: c.get('nfe_emit_cnpj') || '',
            endereco: c.get('nfe_emit_endereco') || '',
            municipio: c.get('nfe_emit_municipio') || '',
            uf: c.get('nfe_emit_uf') || '',
        }
    };
}

// Gera um payload padronizado NFe (modelo simples, adaptável a qualquer provedor)
function montarPayloadNFe(db, venda, itens, cliente, config) {
    return {
        operacao: 1, // 1 = venda
        natureza_operacao: 'VENDA',
        modelo: 55,
        emitente: {
            nome: config.emitente.nome,
            cpf_cnpj: config.emitente.cpfCnpj,
            endereco: config.emitente.endereco,
            municipio: config.emitente.municipio,
            uf: config.emitente.uf,
        },
        destinatario: {
            nome: cliente?.nome || '',
            cpf_cnpj: cliente?.cpf_cnpj || '',
            endereco: cliente?.endereco || '',
            email: cliente?.email || '',
            telefone: cliente?.telefone || '',
        },
        data_emissao: venda.data,
        observacao: venda.observacao || '',
        valores: {
            total_produtos: Number(venda.total_produtos || 0),
            desconto: Number(venda.total_desconto || 0),
            total: Number(venda.total_final || 0),
        },
        itens: (itens || []).map(i => ({
            codigo: i.produto_id,
            descricao: i.produto_nome || 'Produto',
            ncm: i.ncm || (i.ncm_codigo) || '',
            quantidade: Number(i.quantidade || 0),
            valor_unitario: Number(i.preco_unitario || 0),
            valor_total: Number(i.preco_total || i.preco_unitario * i.quantidade || 0),
        })),
        referencia_interna: 'venda_' + venda.id,
    };
}

function requestJson(method, url, body, headers) {
    return new Promise((resolve, reject) => {
        let lib = url.startsWith('https:') ? https : http;
        const u = new URL(url);
        const options = {
            method,
            hostname: u.hostname,
            port: u.port,
            path: u.pathname + u.search,
            headers: Object.assign({
                'Content-Type': 'application/json',
                'Accept': 'application/json, application/pdf',
            }, headers || {})
        };
        const req = lib.request(options, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                const ctype = (res.headers['content-type'] || '').toLowerCase();
                if (/application\/pdf|octet-stream/.test(ctype) || body === null) {
                    return resolve({ status: res.statusCode, buffer: buf, contentType: ctype });
                }
                let data;
                try { data = JSON.parse(buf.toString('utf8')); } catch { data = buf.toString('utf8'); }
                resolve({ status: res.statusCode, data });
            });
        });
        req.on('error', reject);
        if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
        req.end();
    });
}

// Emite a NFe de uma venda e salva o DANFE (PDF) como documento no banco.
async function emitirNFe(vendaId, db) {
    const venda = db.vendas.get(vendaId);
    if (!venda) throw new Error('Venda não encontrada');
    const itens = db.vendas.itens(vendaId);
    const cliente = venda.cliente_id ? db.clientes.get(venda.cliente_id) : null;

    const config = getConfig(db);
    if (!config.baseUrl) throw new Error('Configure a URL da API de NFe em Configurações (nfe_api_url)');

    const payload = montarPayloadNFe(db, venda, itens, cliente, config);

    const headers = {};
    if (config.apiKey) headers['Authorization'] = 'Bearer ' + config.apiKey;

    const resp = await requestJson('POST', config.baseUrl, payload, headers);

    // Trata retorno: pode ser JSON contendo URL/b64 do DANFE, ou PDF direto.
    let pdfBuffer = null;
    if (Buffer.isBuffer(resp.buffer) && resp.buffer.length) {
        pdfBuffer = resp.buffer;
    } else if (resp.data) {
        const d = resp.data;
        const pdfUrl = d.pdf || d.danfe || d.url || d.link || (d.data && d.data.pdf);
        const b64 = d.pdfBase64 || d.danfe_base64 || (d.data && d.data.pdf_base64);
        if (pdfUrl) {
            const pr = await requestJson('GET', pdfUrl, null);
            if (Buffer.isBuffer(pr.buffer) && pr.buffer.length) pdfBuffer = pr.buffer;
        } else if (b64) {
            pdfBuffer = Buffer.from(b64, 'base64');
        }
    }

    if (!pdfBuffer) throw new Error('API de NFe não retornou o DANFE (PDF): ' + (resp.data ? JSON.stringify(resp.data).substring(0, 300) : 'resposta vazia'));

    // Persiste o DANFE no disco + banco de documentos
    const dir = path.join(app.getPath('userData'), 'danfes');
    fs.mkdirSync(dir, { recursive: true });
    const fileName = 'NFe-' + String(venda.id).padStart(4, '0') + '-' + Date.now() + '.pdf';
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, pdfBuffer);

    const doc = db.documentos.create({
        nome_original: fileName,
        nome_arquivo: fileName,
        tipo: 'pdf',
        tamanho: pdfBuffer.length,
        caminho: filePath,
        referencia_tipo: 'venda',
        referencia_id: venda.id,
    });

    return {
        success: true,
        vendaId: venda.id,
        pdfPath: filePath,
        pdfBase64: pdfBuffer.toString('base64'),
        documentoId: doc ? doc.id : null,
    };
}

module.exports = { emitirNFe, montarPayloadNFe, getConfig, requestJson };
