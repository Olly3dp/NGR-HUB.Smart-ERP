const { contextBridge, ipcRenderer } = require('electron');

let dbReadyFired = false;
ipcRenderer.on('db-ready', () => { dbReadyFired = true; });

contextBridge.exposeInMainWorld('ngr', {
    initDB: () => ipcRenderer.invoke('init-db'),
    onDBReady: (cb) => {
        if (dbReadyFired) { cb(); return; }
        ipcRenderer.once('db-ready', () => { dbReadyFired = true; cb(); });
    },
    onDBChange: (cb) => { ipcRenderer.on('db-changed', (e, table) => cb(table)); },

    loadModel: () => ipcRenderer.invoke('llm-load-model'),
    unloadModel: () => ipcRenderer.invoke('llm-unload-model'),

    llmGenerate: (data) => ipcRenderer.invoke('llm-generate', data),
    llmAbort: () => ipcRenderer.invoke('llm-abort'),
    onLLMToken: (cb) => { ipcRenderer.on('llm-token', (e, t) => cb(t)); },
    onLLMDone: (cb) => { ipcRenderer.on('llm-done', (e, d) => cb(d)); },
    onLLMError: (cb) => { ipcRenderer.on('generate-error', (e, msg) => cb(msg)); },

    sttStart: () => ipcRenderer.invoke('stt-start'),
    sttStop: () => ipcRenderer.invoke('stt-stop'),

    contas: {
        list: (f) => ipcRenderer.invoke('db-contas-list', f),
        create: (d) => ipcRenderer.invoke('db-contas-create', d),
        update: (id, d) => ipcRenderer.invoke('db-contas-update', { id, dados: d }),
        remove: (id) => ipcRenderer.invoke('db-contas-remove', id),
        get: (id) => ipcRenderer.invoke('db-contas-get', id),
        pagar: (id, data) => ipcRenderer.invoke('db-contas-pagar', { id, data }),
        resumo: () => ipcRenderer.invoke('db-contas-resumo'),
    },
    tarefas: {
        list: (f) => ipcRenderer.invoke('db-tarefas-list', f),
        create: (d) => ipcRenderer.invoke('db-tarefas-create', d),
        update: (id, d) => ipcRenderer.invoke('db-tarefas-update', { id, dados: d }),
        remove: (id) => ipcRenderer.invoke('db-tarefas-remove', id),
        get: (id) => ipcRenderer.invoke('db-tarefas-get', id),
    },
    fichas: {
        list: (f) => ipcRenderer.invoke('db-fichas-list', f),
        create: (d) => ipcRenderer.invoke('db-fichas-create', d),
        update: (id, d) => ipcRenderer.invoke('db-fichas-update', { id, dados: d }),
        remove: (id) => ipcRenderer.invoke('db-fichas-remove', id),
        get: (id) => ipcRenderer.invoke('db-fichas-get', id),
    },
    documentos: {
        list: (f) => ipcRenderer.invoke('db-docs-list', f),
        remove: (id) => ipcRenderer.invoke('db-docs-remove', id),
        upload: (ref) => ipcRenderer.invoke('db-docs-upload', ref || {}),
        download: (id) => ipcRenderer.invoke('db-docs-download', id),
        update: (id, d) => ipcRenderer.invoke('db-docs-update', { id, dados: d }),
        ocr: (id) => ipcRenderer.invoke('db-docs-ocr', id),
        preview: (id) => ipcRenderer.invoke('db-docs-preview', id),
    },
    eventos: {
        list: (f) => ipcRenderer.invoke('db-eventos-list', f),
        create: (d) => ipcRenderer.invoke('db-eventos-create', d),
        remove: (id) => ipcRenderer.invoke('db-eventos-remove', id),
        update: (id, d) => ipcRenderer.invoke('db-eventos-update', { id, dados: d }),
    },
    categorias: {
        list: (t) => ipcRenderer.invoke('db-categorias-list', t),
    },
    conversas: {
        list: () => ipcRenderer.invoke('db-conversas-list'),
        create: () => ipcRenderer.invoke('db-conversas-create'),
        get: (id) => ipcRenderer.invoke('db-conversas-get', id),
        remove: (id) => ipcRenderer.invoke('db-conversas-remove', id),
        mensagens: (id) => ipcRenderer.invoke('db-conversas-mensagens', id),
        addMsg: (id, papel, conteudo) => ipcRenderer.invoke('db-conversas-add-msg', { conversa_id: id, papel, conteudo }),
    },
    fornecedores: {
        list: (f) => ipcRenderer.invoke('db-fornecedores-list', f),
        create: (d) => ipcRenderer.invoke('db-fornecedores-create', d),
        update: (id, d) => ipcRenderer.invoke('db-fornecedores-update', { id, dados: d }),
        remove: (id) => ipcRenderer.invoke('db-fornecedores-remove', id),
        get: (id) => ipcRenderer.invoke('db-fornecedores-get', id),
    },
    produtos: {
        list: (f) => ipcRenderer.invoke('db-produtos-list', f),
        create: (d) => ipcRenderer.invoke('db-produtos-create', d),
        update: (id, d) => ipcRenderer.invoke('db-produtos-update', { id, dados: d }),
        remove: (id) => ipcRenderer.invoke('db-produtos-remove', id),
        get: (id) => ipcRenderer.invoke('db-produtos-get', id),
        historico: (id, meses) => ipcRenderer.invoke('db-produtos-historico', { id, meses }),
        movimentar: (id, tipo, qtd, obs, doc) => ipcRenderer.invoke('db-produtos-movimentar', { id, tipo, qtd, obs, doc }),
        movimentos: (id) => ipcRenderer.invoke('db-produtos-movimentos', id),
    },
    clientes: {
        list: (f) => ipcRenderer.invoke('db-clientes-list', f),
        create: (d) => ipcRenderer.invoke('db-clientes-create', d),
        update: (id, d) => ipcRenderer.invoke('db-clientes-update', { id, dados: d }),
        remove: (id) => ipcRenderer.invoke('db-clientes-remove', id),
        get: (id) => ipcRenderer.invoke('db-clientes-get', id),
        top: (l) => ipcRenderer.invoke('db-clientes-top', l),
    },
    vendas: {
        list: (f) => ipcRenderer.invoke('db-vendas-list', f),
        create: (d) => ipcRenderer.invoke('db-vendas-create', d),
        get: (id) => ipcRenderer.invoke('db-vendas-get', id),
        update: (id, d) => ipcRenderer.invoke('db-vendas-update', { id, dados: d }),
        remove: (id) => ipcRenderer.invoke('db-vendas-remove', id),
        itens: (id) => ipcRenderer.invoke('db-vendas-itens', id),
        addItem: (venda_id, produto_id, qtd, preco) => ipcRenderer.invoke('db-vendas-add-item', { venda_id, produto_id, qtd, preco }),
        removeItem: (id, venda_id) => ipcRenderer.invoke('db-vendas-remove-item', { id, venda_id }),
        finalizar: (id, pagamento) => ipcRenderer.invoke('db-vendas-finalizar', { id, pagamento }),
        resumo: (meses) => ipcRenderer.invoke('db-vendas-resumo', meses),
    },
    precificacao: {
        list: (pid) => ipcRenderer.invoke('db-precificacao-list', pid),
        create: (d) => ipcRenderer.invoke('db-precificacao-create', d),
        remove: (id) => ipcRenderer.invoke('db-precificacao-remove', id),
        calcular: (produto) => ipcRenderer.invoke('db-precificacao-calcular', produto),
    },
    previsao: {
        list: (tipo) => ipcRenderer.invoke('db-previsao-list', tipo),
        demanda: (produto_id, periodos) => ipcRenderer.invoke('db-previsao-demanda', { produto_id, periodos }),
        financeiro: (tipo, periodos) => ipcRenderer.invoke('db-previsao-financeiro', { tipo, periodos }),
    },
    config: {
        get: (chave) => ipcRenderer.invoke('db-config-get', chave),
        set: (chave, valor) => ipcRenderer.invoke('db-config-set', { chave, valor }),
        getAll: () => ipcRenderer.invoke('db-config-getAll'),
    },

    licenca: {
        status: () => ipcRenderer.invoke('db-licence-status'),
        verifyAndActivate: (plano, email) => ipcRenderer.invoke('db-licence-verify-and-activate', { plano, email }),
        master: (email, senha) => ipcRenderer.invoke('db-licence-master', { email, senha }),
        groq: (chave) => ipcRenderer.invoke('db-licence-groq', { chave }),
    },

    nfe: {
        emitir: (vendaId) => ipcRenderer.invoke('nfe-emitir', vendaId),
    },

    print: {
        pdf: (dataUrl, opts) => ipcRenderer.invoke('imprimir-pdf', Object.assign({ dataUrl }, opts || {})),
        html: (html, opts) => ipcRenderer.invoke('imprimir-html', Object.assign({ html }, opts || {})),
    },

    ngrbot: {
        open: () => ipcRenderer.invoke('ngrbot-open'),
        status: () => ipcRenderer.invoke('ngrbot-status'),
        onStatus: (cb) => { ipcRenderer.on('ngrbot-status', (e, s) => cb(s)); },
        configUpdate: (data) => ipcRenderer.invoke('ngrbot-config-update', data),
        configGet: () => ipcRenderer.invoke('ngrbot-config-get'),
    },

    removeAllListeners: () => {
        ipcRenderer.removeAllListeners('llm-token');
        ipcRenderer.removeAllListeners('llm-done');
        ipcRenderer.removeAllListeners('generate-error');
        ipcRenderer.removeAllListeners('model-status');
        ipcRenderer.removeAllListeners('db-ready');
    }
});
