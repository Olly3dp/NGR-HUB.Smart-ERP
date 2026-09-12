const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');
const { EventEmitter } = require('events');
const { app } = require('electron');

const DB_DIR = path.join(app.getPath('userData'));
const DB_PATH = path.join(DB_DIR, 'ngr_gestao.db');

// Emissor global de eventos de escrita: avisa o main process para que os
// modulos dependentes re-renderizem (sincronizacao cross-module automatica).
const dbEvents = new EventEmitter();
let SQL = null;
let db = null;
let _saveTimer = null;
let _savePending = false;

function _db() {
    if (!db) throw new Error('Database not initialized');
    return db;
}

function save() {
    if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
    _savePending = false;
    try {
        const data = _db().export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (e) {
        console.error('[DB] save error:', e.message);
    }
}

function _scheduleSave() {
    if (_savePending) return;
    _savePending = true;
    _saveTimer = setTimeout(() => save(), 200);
}

// Sanitiza um valor antes de bind no SQLite. O sql.js quebra ao tentar ligar
// `undefined` (ou objetos/funcoes) == "Wrong API use: tried to bind a value of
// an unknown type (undefined)". Convertemos tudo que nao seja serializavel.
function normParam(v) {
    if (v === undefined) return null;
    const t = typeof v;
    if (t === 'bigint') return Number(v);
    if (t === 'object' && v !== null) {
        if (v instanceof Date) return v.toISOString();
        if (Array.isArray(v)) return JSON.stringify(v);
        return JSON.stringify(v);
    }
    if (t === 'function' || t === 'symbol') return null;
    return v;
}

// Remove chaves indefinidas e normaliza valores de um objeto de dados.
function normData(data) {
    const out = {};
    for (const k of Object.keys(data)) {
        const v = data[k];
        if (v === undefined) continue; // pula campos undefined em inserts/updates
        out[k] = normParam(v);
    }
    return out;
}

function query(sql, params = []) {
    return _db().exec(sql, params.map(normParam));
}

function run(sql, params = []) {
    _db().run(sql, params.map(normParam));
    _scheduleSave();
}

function all(sql, params = []) {
    const stmt = _db().prepare(sql);
    if (params.length) stmt.bind(params.map(normParam));
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

function get(sql, params = []) {
    const rows = all(sql, params);
    return rows.length > 0 ? rows[0] : null;
}

function insert(table, data) {
    const clean = normData(data);
    const keys = Object.keys(clean);
    const cols = keys.join(', ');
    const vals = keys.map(() => '?').join(', ');
    const q = `INSERT INTO ${table} (${cols}) VALUES (${vals})`;
    _db().run(q, keys.map(k => clean[k]));
    const id = _db().exec('SELECT last_insert_rowid() as id')[0]?.values?.[0]?.[0];
    _scheduleSave();
    dbEvents.emit('change', table);
    return id;
}

// Cache de tabelas que possuem a coluna updated_at (evita PRAGMA a cada update).
const _tablesWithUpdatedAt = new Map();
function tableHasUpdatedAt(table) {
    if (_tablesWithUpdatedAt.has(table)) return _tablesWithUpdatedAt.get(table);
    let has = false;
    try {
        const res = _db().exec(`PRAGMA table_info("${table}")`);
        const rows = res?.[0]?.values || [];
        has = rows.some(r => r[1] === 'updated_at');
    } catch {}
    _tablesWithUpdatedAt.set(table, has);
    return has;
}

function update(table, id, data) {
    const clean = normData(data);
    const keys = Object.keys(clean);
    if (!keys.length) return;
    const sets = keys.map(k => `${k} = ?`).join(', ');
    // So estampa updated_at se a tabela realmente tiver essa coluna (tabelas
    // como documentos/eventos/mensagens nao possuem e nao podem recebe-la).
    const appendUpdatedAt = !keys.includes('updated_at') && tableHasUpdatedAt(table);
    const q = `UPDATE ${table} SET ${sets}${appendUpdatedAt ? ", updated_at = datetime('now')" : ''} WHERE id = ?`;
    _db().run(q, [...keys.map(k => clean[k]), id]);
    _scheduleSave();
    dbEvents.emit('change', table);
}

function remove(table, id) {
    _db().run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    _scheduleSave();
    dbEvents.emit('change', table);
}

async function init() {
    if (db) return;
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    SQL = await initSqlJs();
    if (fs.existsSync(DB_PATH)) {
        const buf = fs.readFileSync(DB_PATH);
        db = new SQL.Database(buf);
    } else {
        db = new SQL.Database();
    }
    db.run('PRAGMA foreign_keys = ON');
    createTables();
    migrateVendasStatus();
    seedData();
    save();
}

function createTables() {
    db.run(`CREATE TABLE IF NOT EXISTS categorias (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('receita', 'despesa', 'ambos')),
        cor TEXT DEFAULT '#6366f1',
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS contas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        descricao TEXT NOT NULL,
        valor REAL NOT NULL,
        data_vencimento TEXT NOT NULL,
        data_pagamento TEXT,
        status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'pago', 'atrasado', 'cancelado')),
        tipo TEXT DEFAULT 'despesa' CHECK(tipo IN ('receita', 'despesa')),
        categoria_id INTEGER REFERENCES categorias(id),
        observacao TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS tarefas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        descricao TEXT,
        status TEXT DEFAULT 'pendente' CHECK(status IN ('pendente', 'andamento', 'concluida', 'cancelada')),
        prioridade TEXT DEFAULT 'media' CHECK(prioridade IN ('baixa', 'media', 'alta')),
        data_vencimento TEXT,
        categoria TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fichas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        conteudo TEXT,
        status TEXT DEFAULT 'rascunho' CHECK(status IN ('rascunho', 'ativo', 'arquivado')),
        tipo TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS documentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome_original TEXT NOT NULL,
        nome_arquivo TEXT NOT NULL,
        tipo TEXT,
        tamanho INTEGER,
        caminho TEXT NOT NULL,
        referencia_tipo TEXT,
        referencia_id INTEGER,
        ocr_texto TEXT,
        favorito INTEGER DEFAULT 0,
        is_favorite INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    const docCols = db.exec('PRAGMA table_info(documentos)')[0]?.values || [];
    if (!docCols.some(c => c && c[1] === 'favorito')) {
        try { db.run('ALTER TABLE documentos ADD COLUMN favorito INTEGER DEFAULT 0'); } catch (e) {}
    }
    if (!docCols.some(c => c && c[1] === 'is_favorite')) {
        try { db.run('ALTER TABLE documentos ADD COLUMN is_favorite INTEGER DEFAULT 0'); } catch (e) {}
    }

    db.run(`CREATE TABLE IF NOT EXISTS eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT NOT NULL,
        descricao TEXT,
        data_inicio TEXT NOT NULL,
        data_fim TEXT,
        tipo TEXT DEFAULT 'evento' CHECK(tipo IN ('evento', 'lembrete', 'vencimento', 'tarefa')),
        referencia_tipo TEXT,
        referencia_id INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS conversas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS mensagens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversa_id INTEGER NOT NULL REFERENCES conversas(id) ON DELETE CASCADE,
        papel TEXT NOT NULL CHECK(papel IN ('user', 'assistant', 'system')),
        conteudo TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS fornecedores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cnpj TEXT,
        contato TEXT,
        email TEXT,
        telefone TEXT,
        endereco TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS produtos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        descricao TEXT,
        sku TEXT UNIQUE,
        codigo_barras TEXT,
        ncm TEXT,
        preco_custo REAL DEFAULT 0,
        preco_venda REAL DEFAULT 0,
        preco_minimo REAL DEFAULT 0,
        estoque_atual REAL DEFAULT 0,
        estoque_minimo REAL DEFAULT 0,
        estoque_maximo REAL DEFAULT 0,
        unidade TEXT DEFAULT 'un',
        categoria_id INTEGER REFERENCES categorias(id),
        fornecedor_id INTEGER REFERENCES fornecedores(id),
        tipo TEXT DEFAULT 'produto' CHECK(tipo IN ('produto', 'servico')),
        ativo INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    const prodCols = db.exec('PRAGMA table_info(produtos)')[0]?.values || [];
    if (!prodCols.some(c => c && c[1] === 'tipo')) {
        try { db.run(`ALTER TABLE produtos ADD COLUMN tipo TEXT DEFAULT 'produto'`); } catch (e) {}
    }

    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cpf_cnpj TEXT,
        email TEXT,
        telefone TEXT,
        endereco TEXT,
        total_compras REAL DEFAULT 0,
        ultima_compra TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS vendas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER REFERENCES clientes(id),
        data TEXT NOT NULL,
        total_produtos REAL DEFAULT 0,
        total_desconto REAL DEFAULT 0,
        total_final REAL DEFAULT 0,
        status TEXT DEFAULT 'finalizada' CHECK(status IN ('orcamento', 'finalizada', 'cancelada', 'rascunho', 'pendente')),
        forma_pagamento TEXT,
        observacao TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS venda_itens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venda_id INTEGER NOT NULL REFERENCES vendas(id) ON DELETE CASCADE,
        produto_id INTEGER REFERENCES produtos(id),
        quantidade REAL NOT NULL,
        preco_unitario REAL NOT NULL,
        preco_total REAL NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS estoque_movimentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER NOT NULL REFERENCES produtos(id),
        tipo TEXT NOT NULL CHECK(tipo IN ('entrada', 'saida', 'ajuste', 'perda')),
        quantidade REAL NOT NULL,
        saldo_anterior REAL NOT NULL,
        saldo_posterior REAL NOT NULL,
        documento TEXT,
        observacao TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS precificacao_regras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        produto_id INTEGER REFERENCES produtos(id),
        nome_regra TEXT NOT NULL,
        tipo TEXT NOT NULL CHECK(tipo IN ('markup', 'desconto', 'promocao', 'demanda')),
        valor REAL NOT NULL,
        ativo INTEGER DEFAULT 1,
        data_inicio TEXT,
        data_fim TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS previsoes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT NOT NULL CHECK(tipo IN ('demanda', 'receita', 'despesa', 'fluxo')),
        alvo_id INTEGER,
        alvo_nome TEXT,
        periodo_inicio TEXT NOT NULL,
        periodo_fim TEXT NOT NULL,
        valor_previsto REAL NOT NULL,
        metrica TEXT,
        created_at TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS config (
        chave TEXT PRIMARY KEY,
        valor TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS perfil (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        nome TEXT DEFAULT '',
        sobre_mim TEXT DEFAULT '',
        updated_at TEXT DEFAULT (datetime('now'))
    )`);
    db.run(`INSERT OR IGNORE INTO perfil (id, nome, sobre_mim) VALUES (1, '', '')`);
}

function migrateVendasStatus() {
    try {
        if (config_api.get('mig_vendas_status') === '1') return;
        const row = get("SELECT sql FROM sqlite_master WHERE type='table' AND name='vendas'");
        const ddl = (row && row.sql) || '';
        // Ajusta o CHECK de status da tabela vendas que nao aceitava rascunho/pendente
        if (ddl.includes('rascunho')) { config_api.set('mig_vendas_status', '1'); return; }
        const cols = all('PRAGMA table_info(vendas)').map(c => c.name);
        const dados = all('SELECT * FROM vendas');
        db.run('PRAGMA foreign_keys = OFF');
        db.run('BEGIN');
        db.run(`CREATE TABLE IF NOT EXISTS vendas_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cliente_id INTEGER REFERENCES clientes(id),
            data TEXT NOT NULL,
            total_produtos REAL DEFAULT 0,
            total_desconto REAL DEFAULT 0,
            total_final REAL DEFAULT 0,
            status TEXT DEFAULT 'finalizada' CHECK(status IN ('orcamento', 'finalizada', 'cancelada', 'rascunho', 'pendente')),
            forma_pagamento TEXT,
            observacao TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        )`);
        const keys = cols.filter(k => k !== 'id');
        const q = `INSERT INTO vendas_new (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
        const stmt = _db().prepare(q);
        for (const r of dados) { stmt.run(keys.map(k => r[k])); }
        stmt.free();
        db.run('DROP TABLE vendas');
        db.run('ALTER TABLE vendas_new RENAME TO vendas');
        db.run('COMMIT');
        db.run('PRAGMA foreign_keys = ON');
        config_api.set('mig_vendas_status', '1');
    } catch (e) {
        try { db.run('ROLLBACK'); } catch {}
        try { db.run('PRAGMA foreign_keys = ON'); } catch {}
        console.error('[DB] migracao vendas_status falhou:', e.message);
    }
}

function seedData() {
    const count = db.exec('SELECT COUNT(*) as c FROM categorias')[0]?.values?.[0]?.[0] || 0;
    if (count > 0) return;
    const cats = [
        ['Moradia', 'despesa', '#ef4444'],
        ['Alimentação', 'despesa', '#f97316'],
        ['Transporte', 'despesa', '#eab308'],
        ['Saúde', 'despesa', '#22c55e'],
        ['Educação', 'despesa', '#3b82f6'],
        ['Lazer', 'despesa', '#a855f7'],
        ['Salário', 'receita', '#06b6d4'],
        ['Freelance', 'receita', '#14b8a6'],
        ['Investimentos', 'receita', '#8b5cf6'],
    ];
    for (const [nome, tipo, cor] of cats) {
        db.run('INSERT INTO categorias (nome, tipo, cor) VALUES (?, ?, ?)', [nome, tipo, cor]);
    }
}

const contas_api = {
    list: (filtro = {}) => {
        let q = `SELECT c.*, cat.nome as categoria_nome, cat.cor as categoria_cor
                 FROM contas c LEFT JOIN categorias cat ON c.categoria_id = cat.id WHERE 1=1`;
        const params = [];
        if (filtro.status) { q += ' AND c.status = ?'; params.push(filtro.status); }
        if (filtro.tipo) { q += ' AND c.tipo = ?'; params.push(filtro.tipo); }
        if (filtro.categoria_id) { q += ' AND c.categoria_id = ?'; params.push(filtro.categoria_id); }
        if (filtro.descricao) { q += ' AND c.descricao LIKE ?'; params.push(`%${filtro.descricao}%`); }
        q += ' ORDER BY c.data_vencimento ASC';
        return all(q, params);
    },
    create: (dados) => insert('contas', dados),
    update: (id, dados) => update('contas', id, dados),
    remove: (id) => remove('contas', id),
    get: (id) => get('SELECT c.*, cat.nome as categoria_nome FROM contas c LEFT JOIN categorias cat ON c.categoria_id = cat.id WHERE c.id = ?', [id]),
    pagar: (id, data) => update('contas', id, { status: 'pago', data_pagamento: data || new Date().toISOString().split('T')[0] }),
    resumo: () => {
        const pendentes = all("SELECT COALESCE(SUM(valor), 0) as total FROM contas WHERE status NOT IN ('pago', 'cancelado')");
        const vencendo = all("SELECT COALESCE(SUM(valor), 0) as total FROM contas WHERE status NOT IN ('pago', 'cancelado') AND data_vencimento BETWEEN date('now') AND date('now', '+7 days')");
        const pagas = all("SELECT COALESCE(SUM(valor), 0) as total FROM contas WHERE status = 'pago' AND strftime('%Y-%m', data_pagamento) = strftime('%Y-%m', 'now')");
        const atrasadas = all("SELECT COALESCE(SUM(valor), 0) as total FROM contas WHERE status NOT IN ('pago', 'cancelado') AND data_vencimento < date('now')");
        return { pendentes: pendentes[0].total, vencendo: vencendo[0].total, pagas: pagas[0].total, atrasadas: atrasadas[0].total };
    }
};

const tarefas_api = {
    list: (filtro = {}) => {
        let q = 'SELECT * FROM tarefas WHERE 1=1';
        const params = [];
        if (filtro.status) { q += ' AND status = ?'; params.push(filtro.status); }
        if (filtro.prioridade) { q += ' AND prioridade = ?'; params.push(filtro.prioridade); }
        if (filtro.titulo) { q += ' AND titulo LIKE ?'; params.push(`%${filtro.titulo}%`); }
        q += ' ORDER BY data_vencimento ASC, prioridade DESC';
        return all(q, params);
    },
    create: (dados) => insert('tarefas', dados),
    update: (id, dados) => update('tarefas', id, dados),
    remove: (id) => remove('tarefas', id),
    get: (id) => get('SELECT * FROM tarefas WHERE id = ?', [id]),
};

const fichas_api = {
    list: (filtro = {}) => {
        let q = 'SELECT * FROM fichas WHERE 1=1';
        const params = [];
        if (filtro.status) { q += ' AND status = ?'; params.push(filtro.status); }
        q += ' ORDER BY updated_at DESC';
        return all(q, params);
    },
    create: (dados) => insert('fichas', dados),
    update: (id, dados) => update('fichas', id, dados),
    remove: (id) => remove('fichas', id),
    get: (id) => get('SELECT * FROM fichas WHERE id = ?', [id]),
};

const docs_api = {
    list: (filtro = {}) => {
        let q = 'SELECT * FROM documentos WHERE 1=1';
        const params = [];
        if (filtro.referencia_tipo) { q += ' AND referencia_tipo = ?'; params.push(filtro.referencia_tipo); }
        if (filtro.referencia_id) { q += ' AND referencia_id = ?'; params.push(Number(filtro.referencia_id)); }
        q += ' ORDER BY created_at DESC';
        return all(q, params);
    },
    create: (dados) => insert('documentos', dados),
    remove: (id) => remove('documentos', id),
    get: (id) => get('SELECT * FROM documentos WHERE id = ?', [id]),
};

const eventos_api = {
    list: (filtro = {}) => {
        let q = 'SELECT * FROM eventos WHERE 1=1';
        const params = [];
        if (filtro.tipo) { q += ' AND tipo = ?'; params.push(filtro.tipo); }
        if (filtro.inicio) { q += " AND data_inicio >= ?"; params.push(filtro.inicio); }
        if (filtro.fim) { q += " AND data_inicio <= ?"; params.push(filtro.fim); }
        q += ' ORDER BY data_inicio ASC';
        return all(q, params);
    },
    create: (dados) => insert('eventos', dados),
    update: (id, dados) => update('eventos', id, dados),
    remove: (id) => remove('eventos', id),
};

const categorias_api = {
    list: (tipo = null) => {
        if (tipo) return all('SELECT * FROM categorias WHERE tipo = ? OR tipo = ? ORDER BY nome', [tipo, 'ambos']);
        return all('SELECT * FROM categorias ORDER BY nome');
    },
};

const conversas_api = {
    list: () => all('SELECT * FROM conversas ORDER BY updated_at DESC'),
    create: (titulo = 'Nova conversa') => { const id = insert('conversas', { titulo }); return id; },
    get: (id) => get('SELECT * FROM conversas WHERE id = ?', [id]),
    update: (id, dados) => update('conversas', id, dados),
    remove: async (id) => {
        run('DELETE FROM mensagens WHERE conversa_id = ?', [id]);
        remove('conversas', id);
    },
    mensagens: (conversa_id) => all('SELECT * FROM mensagens WHERE conversa_id = ? ORDER BY created_at ASC', [conversa_id]),
    addMensagem: (conversa_id, papel, conteudo) => insert('mensagens', { conversa_id, papel, conteudo }),
};

const fornecedores_api = {
    list: (filtro = {}) => {
        let q = 'SELECT * FROM fornecedores WHERE 1=1';
        const params = [];
        if (filtro.nome) { q += ' AND nome LIKE ?'; params.push(`%${filtro.nome}%`); }
        q += ' ORDER BY nome';
        return all(q, params);
    },
    create: (dados) => { const id = insert('fornecedores', dados); return get('SELECT * FROM fornecedores WHERE id = ?', [id]); },
    update: (id, dados) => { update('fornecedores', id, dados); return get('SELECT * FROM fornecedores WHERE id = ?', [id]); },
    remove: (id) => remove('fornecedores', id),
    get: (id) => get('SELECT * FROM fornecedores WHERE id = ?', [id]),
};

const produtos_api = {
    list: (filtro = {}) => {
        let q = `SELECT p.*, f.nome as fornecedor_nome, cat.nome as categoria_nome
                 FROM produtos p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
                 LEFT JOIN categorias cat ON p.categoria_id = cat.id WHERE 1=1`;
        const params = [];
        if (filtro.nome) { q += ' AND p.nome LIKE ?'; params.push(`%${filtro.nome}%`); }
        if (filtro.ativo !== undefined) { q += ' AND p.ativo = ?'; params.push(filtro.ativo); }
        if (filtro.categoria_id) { q += ' AND p.categoria_id = ?'; params.push(filtro.categoria_id); }
        if (filtro.fornecedor_id) { q += ' AND p.fornecedor_id = ?'; params.push(filtro.fornecedor_id); }
        if (filtro.estoque_baixo) { q += ' AND p.tipo = \'produto\' AND p.estoque_atual <= p.estoque_minimo'; }
        q += ' ORDER BY p.nome';
        return all(q, params);
    },
    create: (dados) => { const id = insert('produtos', dados); return produtos_api.get(id); },
    update: (id, dados) => { update('produtos', id, dados); return produtos_api.get(id); },
    remove: (id) => remove('produtos', id),
    get: (id) => get(`SELECT p.*, f.nome as fornecedor_nome, cat.nome as categoria_nome
                       FROM produtos p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
                       LEFT JOIN categorias cat ON p.categoria_id = cat.id WHERE p.id = ?`, [id]),
    historico_vendas: (id, meses = 6) => all(`SELECT strftime('%Y-%m', v.data) as mes, SUM(vi.quantidade) as qtd, SUM(vi.preco_total) as total
        FROM venda_itens vi JOIN vendas v ON vi.venda_id = v.id
        WHERE vi.produto_id = ? AND v.status = 'finalizada'
        AND v.data >= date('now', ?)
        GROUP BY mes ORDER BY mes`, [id, `-${meses * 30} days`]),
    movimentar: (produto_id, tipo, quantidade, observacao, documento) => {
        const prod = produtos_api.get(produto_id);
        if (!prod) throw new Error('Produto nao encontrado');
        // Servicos nao controlam estoque fisico: entrada/saida/ajuste sao no-op.
        if (prod.tipo === 'servico') return prod;
        const saldo_anterior = prod.estoque_atual;
        const saldo_posterior = tipo === 'entrada' ? saldo_anterior + quantidade :
                                tipo === 'saida' ? Math.max(0, saldo_anterior - quantidade) :
                                tipo === 'ajuste' ? quantidade : saldo_anterior - quantidade;
        insert('estoque_movimentos', { produto_id, tipo, quantidade: Math.abs(quantidade), saldo_anterior, saldo_posterior, documento, observacao });
        update('produtos', produto_id, { estoque_atual: saldo_posterior });
        return produtos_api.get(produto_id);
    },
    movimentos: (produto_id) => all('SELECT * FROM estoque_movimentos WHERE produto_id = ? ORDER BY created_at DESC', [produto_id]),
};

const clientes_api = {
    list: (filtro = {}) => {
        let q = 'SELECT * FROM clientes WHERE 1=1';
        const params = [];
        if (filtro.nome) { q += ' AND nome LIKE ?'; params.push(`%${filtro.nome}%`); }
        q += ' ORDER BY nome';
        return all(q, params);
    },
    create: (dados) => { const id = insert('clientes', dados); return get('SELECT * FROM clientes WHERE id = ?', [id]); },
    update: (id, dados) => { update('clientes', id, dados); return get('SELECT * FROM clientes WHERE id = ?', [id]); },
    remove: (id) => remove('clientes', id),
    get: (id) => get('SELECT * FROM clientes WHERE id = ?', [id]),
    top: (limite = 10) => all('SELECT * FROM clientes ORDER BY total_compras DESC LIMIT ?', [limite]),
};

const vendas_api = {
    list: (filtro = {}) => {
        let q = `SELECT v.*, c.nome as cliente_nome
                 FROM vendas v LEFT JOIN clientes c ON v.cliente_id = c.id WHERE 1=1`;
        const params = [];
        if (filtro.status) { q += ' AND v.status = ?'; params.push(filtro.status); }
        if (filtro.cliente_id) { q += ' AND v.cliente_id = ?'; params.push(filtro.cliente_id); }
        if (filtro.data_inicio) { q += ' AND v.data >= ?'; params.push(filtro.data_inicio); }
        if (filtro.data_fim) { q += ' AND v.data <= ?'; params.push(filtro.data_fim); }
        q += ' ORDER BY v.data DESC';
        return all(q, params);
    },
    create: (dados) => { const id = insert('vendas', dados); return vendas_api.get(id); },
    get: (id) => get(`SELECT v.*, c.nome as cliente_nome
                       FROM vendas v LEFT JOIN clientes c ON v.cliente_id = c.id WHERE v.id = ?`, [id]),
    update: (id, dados) => { update('vendas', id, dados); return vendas_api.get(id); },
    remove: (id) => {
        const v = vendas_api.get(id);
        const itens = all('SELECT * FROM venda_itens WHERE venda_id = ?', [id]);
        // Integridade: ao excluir venda finalizada, restaura o estoque baixado
        // na finalizacao e reverte o total_compras do cliente.
        if (v && v.status === 'finalizada') {
            for (const item of itens) {
                if (item.produto_id) {
                    try { produtos_api.movimentar(item.produto_id, 'entrada', item.quantidade, 'Estorno venda #' + id); } catch {}
                }
            }
            if (v.cliente_id) {
                const c = clientes_api.get(v.cliente_id);
                if (c) {
                    const restante = all(`SELECT COALESCE(SUM(total_final),0) as t FROM vendas WHERE cliente_id = ? AND status = 'finalizada' AND id != ?`, [v.cliente_id, id])[0];
                    const ultima = all(`SELECT MAX(data) as d FROM vendas WHERE cliente_id = ? AND status = 'finalizada' AND id != ?`, [v.cliente_id, id])[0];
                    clientes_api.update(v.cliente_id, { total_compras: restante.t || 0, ultima_compra: ultima.d || null });
                }
            }
        }
        remove('vendas', id);
        return { itens };
    },
    itens: (venda_id) => all(`SELECT vi.*, p.nome as produto_nome FROM venda_itens vi
        LEFT JOIN produtos p ON vi.produto_id = p.id WHERE vi.venda_id = ?`, [venda_id]),
    addItem: (venda_id, produto_id, quantidade, preco_unitario) => {
        const preco_total = quantidade * preco_unitario;
        insert('venda_itens', { venda_id, produto_id, quantidade, preco_unitario, preco_total });
        const total = all('SELECT COALESCE(SUM(preco_total),0) as t FROM venda_itens WHERE venda_id = ?', [venda_id]);
        update('vendas', venda_id, { total_produtos: total[0].t, total_final: total[0].t });
        return vendas_api.get(venda_id);
    },
    removeItem: (id, venda_id) => { remove('venda_itens', id);
        const total = all('SELECT COALESCE(SUM(preco_total),0) as t FROM venda_itens WHERE venda_id = ?', [venda_id]);
        update('vendas', venda_id, { total_produtos: total[0].t, total_final: total[0].t }); },
    finalizar: (id, forma_pagamento) => {
        const v = vendas_api.get(id);
        if (!v) throw new Error('Venda nao encontrada');
        update('vendas', id, { status: 'finalizada', forma_pagamento });
        const itens = vendas_api.itens(id);
        for (const item of itens) {
            if (item.produto_id) {
                try { produtos_api.movimentar(item.produto_id, 'saida', item.quantidade, 'Venda #' + id); } catch {}
            }
        }
        if (v.cliente_id) {
            const c = clientes_api.get(v.cliente_id);
            if (c) clientes_api.update(v.cliente_id, {
                total_compras: (c.total_compras || 0) + v.total_final,
                ultima_compra: v.data
            });
        }
        return vendas_api.get(id);
    },
    resumo: (meses = 3) => {
        const intervalo = `-${meses * 30} days`;
        const mensal = all(`SELECT strftime('%Y-%m', data) as mes, COUNT(*) as qtd, SUM(total_final) as total
            FROM vendas WHERE status = 'finalizada' AND data >= date('now', ?) GROUP BY mes ORDER BY mes`, [intervalo]);
        const total = all(`SELECT COUNT(*) as qtd, COALESCE(SUM(total_final),0) as total FROM vendas WHERE status = 'finalizada'`)[0];
        const ticket = all(`SELECT COALESCE(AVG(total_final),0) as medio FROM vendas WHERE status = 'finalizada'`)[0];
        return { mensal, total: total.total, quantidade: total.qtd, ticket_medio: ticket.medio };
    },
};

const precificacao_api = {
    list: (produto_id = null) => {
        if (produto_id) return all('SELECT * FROM precificacao_regras WHERE produto_id = ? ORDER BY created_at DESC', [produto_id]);
        return all('SELECT r.*, p.nome as produto_nome FROM precificacao_regras r LEFT JOIN produtos p ON r.produto_id = p.id ORDER BY r.created_at DESC');
    },
    create: (dados) => { const id = insert('precificacao_regras', dados); return get('SELECT * FROM precificacao_regras WHERE id = ?', [id]); },
    remove: (id) => remove('precificacao_regras', id),
    calcularPrecoSugerido: (produto) => {
        if (!produto || produto.preco_custo == null) return null;
        const custo = Number(produto.preco_custo);
        if (!isFinite(custo)) return null;
        const regras = all('SELECT * FROM precificacao_regras WHERE (produto_id = ? OR produto_id IS NULL) AND ativo = 1 ORDER BY produto_id DESC', [produto.id]);
        let preco = custo;
        const hoje = new Date().toISOString().split('T')[0];
        for (const r of regras) {
            const valor = Number(r.valor);
            if (r.tipo === 'markup') preco = custo * (1 + valor / 100);
            if (r.tipo === 'desconto') preco = preco * (1 - valor / 100);
            if (r.tipo === 'promocao' && r.data_inicio <= hoje && r.data_fim >= hoje)
                preco = preco * (1 - valor / 100);
        }
        const precoMinimo = Number(produto.preco_minimo) || 0;
        if (precoMinimo > 0 && preco < precoMinimo) preco = precoMinimo;
        return Math.round(preco * 100) / 100;
    },
};

const previsao_api = {
    list: (tipo = null) => {
        if (tipo) return all('SELECT * FROM previsoes WHERE tipo = ? ORDER BY periodo_inicio DESC', [tipo]);
        return all('SELECT * FROM previsoes ORDER BY created_at DESC LIMIT 100');
    },
    salvar: (dados) => insert('previsoes', dados),
    preverDemanda: (produto_id, periodos = 3) => {
        const hist = all(`SELECT strftime('%Y-%m', v.data) as mes, SUM(vi.quantidade) as qtd
            FROM venda_itens vi JOIN vendas v ON vi.venda_id = v.id
            WHERE vi.produto_id = ? AND v.status = 'finalizada'
            GROUP BY mes ORDER BY mes`, [produto_id]);
        if (hist.length < 2) return null;
        const valores = hist.map(h => h.qtd);
        const media = valores.reduce((a, b) => a + b, 0) / valores.length;
        const pesoTotal = valores.length * (valores.length + 1) / 2;
        const mediaPonderada = valores.reduce((sum, v, i) => sum + v * (i + 1), 0) / pesoTotal;
        const ultimo = valores[valores.length - 1];
        const alisamento = 0.3 * ultimo + 0.7 * media;
        const previsao = Math.round((mediaPonderada + alisamento) / 2);
        const ultimoMes = hist[hist.length - 1].mes;
        const [ano, mes] = ultimoMes.split('-').map(Number);
        const results = [];
        for (let i = 1; i <= periodos; i++) {
            let m = mes + i, a = ano;
            if (m > 12) { m -= 12; a++; }
            const pm = String(m).padStart(2, '0');
            results.push({ periodo: `${a}-${pm}`, previsao });
        }
        return { produto_id, historico: hist, previsoes: results, media, media_ponderada: mediaPonderada };
    },
    preverFinanceiro: (tipo, periodos = 3) => {
        const op = tipo === 'receita' ? 'receita' : 'despesa';
        const hist = all(`SELECT strftime('%Y-%m', data_vencimento) as mes, SUM(valor) as total
            FROM contas WHERE tipo = ? AND status NOT IN ('cancelado')
            AND data_vencimento >= date('now', '-12 months') GROUP BY mes ORDER BY mes`, [op]);
        if (hist.length < 2) return null;
        const valores = hist.map(h => h.total);
        const media = valores.reduce((a, b) => a + b, 0) / valores.length;
        const ultimo = valores[valores.length - 1];
        const alisamento = 0.4 * ultimo + 0.6 * media;
        const ultimoMes = hist[hist.length - 1].mes;
        const [ano, mes] = ultimoMes.split('-').map(Number);
        const results = [];
        for (let i = 1; i <= periodos; i++) {
            let m = mes + i, a = ano;
            if (m > 12) { m -= 12; a++; }
            const pm = String(m).padStart(2, '0');
            const v = Math.round(alisamento * (1 + Math.sin(i * Math.PI / 6) * 0.15) * 100) / 100;
            results.push({ periodo: `${a}-${pm}`, previsao: v });
            insert('previsoes', { tipo: op, alvo_nome: tipo, periodo_inicio: `${a}-${pm}-01`, periodo_fim: `${a}-${pm}-28`, valor_previsto: v, metrica: 'total' });
        }
        return { tipo, historico: hist, previsoes: results, media };
    },
};

const config_api = {
    get: (chave) => { const r = get('SELECT valor FROM config WHERE chave = ?', [chave]); return r ? r.valor : null; },
    set: (chave, valor) => { db.run('INSERT OR REPLACE INTO config (chave, valor) VALUES (?, ?)', [chave, valor]); _scheduleSave(); },
    getAll: () => { const rows = all('SELECT * FROM config'); const obj = {}; for (const r of rows) obj[r.chave] = r.valor; return obj; },
};

// Licença local e autônoma (guarda no banco config). Conta Master burla todas as restrições.
const LIC_TRIAL_DAYS = 10;
const LIC_RECARGA_DAYS = 30;
const env = process.env.NGR_MASTER_EMAIL || process.env.MASTER_EMAIL || '';
const MASTER_EMAIL = env || 'ngr.alboliver@gmail.com';
const MASTER_PASS = process.env.NGR_MASTER_PASS || process.env.MASTER_PASS || '@NGR2020b';

function _licSet(k, v) { config_api.set(k, v); }
function _licGet(k) { return config_api.get(k); }

// ═════════════════════════════════════════════════════════════════════
// INTEGRIDADE DA LICENCA (ofuscacao offline) — HMAC com segredo embutido.
// Objetivo: impedir a EDICAO CASUAL do ~/.ngr/licenca.json (auto-recarga
// alterando validUntil). O arquivo carrega um MAC (HMAC-SHA256) dos campos.
// Quem editar o JSON sem recalcular o MAC corretamente tem a licenca
// rejeitada. LIMITE: como o segredo está no pacote entregue ao cliente,
// quem souber programar pode extraí-lo e recalcular — é o máximo offline.
// ═════════════════════════════════════════════════════════════════════
const OS_CRYPTO = require('crypto');

// Segredo ofuscado (montado em partes para não aparecer literal no binário
// ao buscar por "ngr_secret" etc.). NÃO é criptograficamente seguro contra
// engenharia reversa, mas dificulta edição manual/scripts simples.
const _LIC_SECRET = (function () {
    const b = Buffer.from(
        '6e67722d6c6963656e63652d7365637265742d76312d30303000', 'hex'
    );
    // aplica um deslocamento simples nos bytes (ofuscação leve)
    for (let i = 0; i < b.length; i++) b[i] = (b[i] + 7) % 256;
    return b.toString('utf8');
})();

// Gera o MAC para um payload de licença.
function _licMac(payload) {
    const installId = payload.installId || _licMachineId();
    const canon = `${installId}|${payload.plano}|${payload.validUntil}`;
    return OS_CRYPTO.createHmac('sha256', _LIC_SECRET).update(canon).digest('hex');
}

// Verifica a integridade de um objeto { installId, plano, validUntil, mac }.
// Retorna o objeto (sem mac) se íntegro; null se adulterado.
function _licCheckIntegrity(rec) {
    try {
        if (!rec || typeof rec !== 'object') return null;
        if (rec.tipo !== 'recarga') return null;
        if (typeof rec.mac !== 'string') return null;
        if (!rec.installId || !rec.plano || !rec.validUntil) return null;
        if (rec.installId !== _licMachineId()) return null; // outra máquina
        const expected = _licMac(rec);
        const actual = rec.mac;
        const a = Buffer.from(expected, 'hex');
        const b = Buffer.from(actual, 'hex');
        if (a.length !== b.length) return null;
        // comparação em tempo constante (evita timing attack trivial)
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
        if (diff !== 0) return null;
        // validade
        const vT = new Date(rec.validUntil).getTime();
        if (isNaN(vT)) return null;
        return { tipo: 'recarga', installId: rec.installId, plano: rec.plano, validUntil: rec.validUntil };
    } catch (e) { console.error('[LIC] checagem de integridade falhou:', e.message); return null; }
}

// Cria o objeto de licença íntegro (com MAC) a partir de plano+validUntil.
function _licBuildRec(plano, validUntil) {
    const installId = _licMachineId();
    const rec = { tipo: 'recarga', installId, plano, validUntil };
    rec.mac = _licMac(rec);
    return rec;
}

// ═════════════════════════════════════════════════════════════════════
// PERSISTENCIA DURAVEL + VINCULO COM A INSTALACAO
// A recarga (validade) e gravada num diretorio fixo FORA do userData,
// para sobreviver a reinstalacao do app / limpeza de userData. Um ID
// unico de maquina vincula a recarga aquil KNOWN instalacao, impedindo
// copiar/transferir licenca para outra maquina.
// ═════════════════════════════════════════════════════════════════════
const os = require('os');
const crypto = require('crypto');

function _licDurableDir() {
    const home = os.homedir() || '';
    const plat = process.platform;
    if (plat === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'NGR');
    if (plat === 'darwin') return path.join(home, 'Library', 'Application Support', 'NGR');
    return path.join(home, '.ngr'); // linux
}

const _LIC_FILE = 'licenca.json';

// ID unico + estavel da instalacao (mac + hostname + volume root), cacheado.
let _installId = null;
function _licMachineId() {
    let raw = '';
    try { raw += JSON.stringify(os.networkInterfaces()); } catch {}
    try { raw += '|' + os.hostname(); } catch {}
    try { raw += '|' + os.userInfo().username; } catch {}
    try { raw += '|' + os.homedir(); } catch {}
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

function _licEnsureDir() {
    const dir = _licDurableDir();
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { console.error('[LIC] mkdir duravel:', e.message); }
    return dir;
}

// Le o arquivo duravel, validando integridade (MAC) E instalacao.
// Devolve o registro limpo, ou null se irregular/temperado/outra maquina.
function _licLoadDurable() {
    try {
        const p = path.join(_licDurableDir(), _LIC_FILE);
        if (!fs.existsSync(p)) return null;
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));

        // 1. Validar MAC (edição manual de validUntil/plano quebra o MAC)
        const rec = _licCheckIntegrity(data);
        if (!rec) {
            console.error('[LIC] licenca duravel INVALIDA (possivel adulteracao)');
            return null;
        }
        return rec;
    } catch (e) { console.error('[LIC] load duravel:', e.message); return null; }
}

// Salva a licenca duravel. Gera/valida o MAC internamente (só aceita registros
// que passem na checagem de integridade).
function _licSaveDurable(rec) {
    try {
        const dir = _licEnsureDir();
        const f = path.join(dir, _LIC_FILE);
        // Re-checa integridade antes de gravar (garante que não salvamos lixo)
        const checked = _licCheckIntegrity(rec);
        if (!checked) {
            console.error('[LIC] recusa salvar licenca sem integridade valida.');
            return;
        }
        fs.writeFileSync(f, JSON.stringify(rec), { mode: 0o600 });
        // backup duplo (resistencia a corrupcao)
        try { fs.copyFileSync(f, path.join(dir, _LIC_FILE + '.bak')); } catch {}
    } catch (e) { console.error('[LIC] save duravel:', e.message); }
}

function _licClearDurable() {
    try { fs.rmSync(path.join(_licDurableDir(), _LIC_FILE), { force: true }); fs.rmSync(path.join(_licDurableDir(), _LIC_FILE + '.bak'), { force: true }); } catch {}
}

// Restaura a recarga duravel no config local (aplicar no startup).
// Só aceita se a assinatura for válida (impede edição manual).
function _licRestoreDurable() {
    const rec = _licLoadDurable();
    if (!rec || rec.tipo !== 'recarga' || !rec.plano || !rec.validUntil) return false;
    const validUntil = new Date(rec.validUntil).getTime();
    if (isNaN(validUntil)) return false;
    // Reler o payload é garantido assinado; usar os campos do payload.
    _licSet('lic_plano', rec.plano);
    _licSet('lic_valid_until', rec.validUntil);
    _licSet('lic_instalacao_tipo', 'recarga');
    return true;
}

const licence_api = {
    TRIAL_DAYS: LIC_TRIAL_DAYS,
    RECARGA_DAYS: LIC_RECARGA_DAYS,

    // Garante data de instalação (início do trial). Roda uma única vez na 1ª instalação.
    // Também restaura, se existir, a recarga durável gravada fora do userData
    // (sobrevive a reinstalação/limpeza do app).
    ensureInstall() {
        if (!_licGet('lic_install')) {
            _licSet('lic_install', new Date().toISOString());
        }
        if (!_licGet('lic_install_id')) {
            _licSet('lic_install_id', _licMachineId());
        }
        // Se houver recarga durável válida (assinada), restaura no config local.
        // Se o arquivo foi adulterado, _licLoadDurable retorna null e o sistema
        // não restaura nada (e valida abaixo se a local ainda combina).
        const rec = _licLoadDurable();
        if (rec) {
            _licSet('lic_plano', rec.plano);
            _licSet('lic_valid_until', rec.validUntil);
            _licSet('lic_instalacao_tipo', 'recarga');
        } else if (_licGet('lic_instalacao_tipo') === 'recarga') {
            // Existe marca local de recarga mas NÃO há duravel válida (sumiu ou
            // foi alterada). Mantém o que estiver no local apenas se ainda valer;
            // caso contrário bloqueia. (Sem duravel assinada, não confiamos ao 100%
            // na local — mas preservamos acesso já pago enquanto o servidor existir.)
            console.error('[LIC] Aviso: recarga local sem respaldo duravel assinada. Verifique ~/.ngr/licenca.json');
        }
    },

    // Máquina é Master? (admin original, acesso total sem restrições)
    isMaster() { return (_licGet('lic_plano') || '') === 'master'; },

    // ID de instalação (para vincular a licença a esta máquina no servidor)
    getInstallId() { return _licMachineId(); },

    // Valida credenciais do master (superusuário original inalterado)
    unlockMaster(email, senha) {
        if (!email || !senha) return false;
        if (String(email).trim().toLowerCase() !== MASTER_EMAIL) return false;
        if (String(senha) !== MASTER_PASS) return false;
        _licSet('lic_plano', 'master');
        _licSet('lic_valid_until', '');
        _licSet('lic_instalacao_tipo', 'master');
        return true;
    },

    // Ativa recarga de 30 dias corridos para um plano (pós-pagamento).
    // Gera localmente o registro integral (com MAC), que persiste no arquivo
    // durável. Qualquer edição manual do arquivo quebra o MAC → rejeitada no
    // próximo load. Retorna { ok, ... }.
    ativarRecarga(plano, dias) {
        this.ensureInstall();
        const d = dias || LIC_RECARGA_DAYS;
        const p = plano === 'smart' || plano === 'pro' ? plano : 'pro';
        // Renova a partir de hoje (não acumula sobre validade antiga)
        const validUntil = new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString();
        const rec = _licBuildRec(p, validUntil);
        _licSet('lic_plano', p);
        _licSet('lic_valid_until', validUntil);
        _licSet('lic_instalacao_tipo', 'recarga');
        // Persistência durável (integral + vinculada à máquina)
        _licSaveDurable(rec);
        return { ok: true, plano: _licGet('lic_plano'), validUntil };
    },

    // Completa uma ativação vinda do fluxo server-side do ngrbot local.
    // (O ngrbot já validou o pagamento; aqui apenas aplicamos a recarga.)
    ativarRecargaServidor(plano, dias) {
        return this.ativarRecarga(plano, dias);
    },

    // Chave Groq do próprio cliente (necessária no Pro / master)
    setGroqKey(chave) { _licSet('lic_groq_key', chave || ''); return true; },
    getGroqKey() { return _licGet('lic_groq_key') || ''; },

    // Status completo da licença local
    getStatus() {
        this.ensureInstall();
        const install = _licGet('lic_install');
        const plano = _licGet('lic_plano') || '';
        const validUntil = _licGet('lic_valid_until') || '';
        const master = plano === 'master';
        const now = Date.now();

        if (master) {
            return { master: true, plano: 'master', status: 'master', acessoLivre: true, diasRestantes: null, validUntil: 'indefinido', trialAtivo: false };
        }

        // Com recarga ativa (validUntil futuro)
        if (validUntil && new Date(validUntil).getTime() > now) {
            const diasRestantes = Math.max(0, Math.ceil((new Date(validUntil).getTime() - now) / (1000 * 60 * 60 * 24)));
            // Aviso de renovação: faltam 3 dias ou menos
            const avisoRecarga = diasRestantes > 0 && diasRestantes <= 3;
            return {
                master: false, plano, status: 'ativo', acessoLivre: true, diasRestantes,
                validUntil, trialAtivo: false, diasTrialRestantes: 0,
                avisoRecarga, avisoDias: avisoRecarga ? diasRestantes : 0,
                avisoDataLimite: new Date(validUntil).toLocaleDateString('pt-BR')
            };
        }

        // Sem recarga: avalia o trial de 10 dias desde a instalação
        const trialExpira = new Date(new Date(install).getTime() + LIC_TRIAL_DAYS * 24 * 60 * 60 * 1000);
        const diasTrialRestantes = Math.ceil((trialExpira.getTime() - now) / (1000 * 60 * 60 * 24));
        if (diasTrialRestantes > 0) {
            return { master: false, plano: plano || null, status: 'trial', acessoLivre: true, diasRestantes: 0, validUntil: trialExpira.toISOString(), trialAtivo: true, diasTrialRestantes };
        }

        // Trial expirou e sem recarga — bloqueio parcial (só Planos/Minha Conta para reativar)
        return { master: false, plano: plano || null, status: 'bloqueado', acessoLivre: false, diasRestantes: 0, validUntil: '', trialAtivo: false, diasTrialRestantes: 0, bloqueado: true };
    },
};

module.exports = {
    init, query, run, all, get, save,
    events: dbEvents,
    contas: contas_api,
    tarefas: tarefas_api,
    fichas: fichas_api,
    documentos: { ...docs_api, update: (id, dados) => update('documentos', id, dados) },
    eventos: eventos_api,
    categorias: categorias_api,
    conversas: conversas_api,
    fornecedores: fornecedores_api,
    produtos: produtos_api,
    clientes: clientes_api,
    vendas: vendas_api,
    precificacao: precificacao_api,
    previsao: previsao_api,
    config: config_api,
    licence: licence_api,
    perfil: {
        get: () => get('SELECT * FROM perfil WHERE id = 1'),
        update: (dados) => { update('perfil', 1, dados); return get('SELECT * FROM perfil WHERE id = 1'); },
    },
};
