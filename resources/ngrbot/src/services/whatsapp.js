const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');
const BotConfig = require('../models/BotConfig');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const ConversationHistory = require('../models/ConversationHistory');

const MAX_ACCOUNTS = 1;

// ===== Proteções anti-ban =====
// Espaço entre envios (ms) para não parecer envio em massa
const SEND_INTERVAL_MS = 3000;
// Cooldown mínimo entre respostas para o mesmo contato (ms)
const CONTACT_COOLDOWN_MS = 6000;
// Tempo de espera antes de responder (simula digitação humana)
const REPLY_DELAY_MIN_MS = 1500;
const REPLY_DELAY_MAX_MS = 4500;

// --- Proteções adicionais contra banimento por fluxo de mensagens ---
// Teto absoluto de mensagens enviadas por dia (independente de contato).
// Se atingido, o bot para de responder até o dia seguinte (evita ban por volume).
const DAILY_OUTGOING_LIMIT = Number(process.env.WA_DAILY_LIMIT || 80);
// Máximo de respostas por conversa/contato por dia.
const MAX_REPLIES_PER_CONTACT_DAY = 20;
// Cooldown para contatos "novos" (nunca atendidos antes) em ms —
// impede responder em rajada a vários desconhecidos de uma vez.
const NEW_CONTACT_COOLDOWN_MS = (process.env.WA_NEW_CONTACT_SECONDS || 40) * 1000;
// Total máximo de contatos distintos respondidos por dia.
const MAX_CONTACTS_PER_DAY = 25;
// Janela de funcionamento (horas do dia em que o bot pode responder).
const ACTIVE_HOUR_START = Number(process.env.WA_HOUR_START || 7);   // 07h
const ACTIVE_HOUR_END = Number(process.env.WA_HOUR_END || 22);      // 22h
// Tamanho máximo do texto a enviar (evita mensagens gigantes).
const MAX_MSG_LEN = 1200;

// Dados opcionais de "contatos permitidos" (allowlist). Se o arquivo
// allowlist_whatsapp.json existir, o bot SÓ responde aos números listados.
// Use para restringir o atendimento apenas a clientes/contatos da empresa.
const ALLOWLIST_FILE = path.join(__dirname, '..', '..', 'allowlist_whatsapp.json');

class WhatsAppService {
  constructor() {
    this.clients = {};
    this.connecting = {};
    this.io = null;
    this.conversations = {};
    this.sendQueue = Promise.resolve();
    this.lastContactReply = {};
    // Estatísticas diárias para controle de volume (resetado à meia-noite)
    this.dayKey = this._dayKey();
    this.daily = { outgoing: 0, contacts: {}, contactCount: 0 };
    // Anti-eco: ignora a MESMA mensagem repetida num intervalo curto (anti-spam).
    this.lastMsgMap = {}; // from -> { body, ts }
  }

  // Ignora a mesma mensagem recebida repetidamente em janela curta.
  // Isso evita responder a spam/radar de contatos que mandam o mesmo texto em rajada.
  isRepeatMessage(from, body) {
    const now = Date.now();
    const last = this.lastMsgMap[from];
    const WINDOW_MS = 60000; // 60s
    if (last && last.body === body && (now - last.ts) < WINDOW_MS) {
      return true;
    }
    this.lastMsgMap[from] = { body, ts: now };
    return false;
  }

  // Chave do dia (AAAA-MM-DD) para resetar contadores à meia-noite
  _dayKey(now) {
    const d = now ? new Date(now) : new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  _rollDaily() {
    const k = this._dayKey();
    if (k !== this.dayKey) {
      this.dayKey = k;
      this.daily = { outgoing: 0, contacts: {}, contactCount: 0 };
    }
  }

  // Horário de funcionamento? Evita responder de madrugada (padrão de banimento).
  isWithinActiveHours() {
    const h = new Date().getHours();
    if (ACTIVE_HOUR_START <= ACTIVE_HOUR_END) {
      return h >= ACTIVE_HOUR_START && h < ACTIVE_HOUR_END;
    }
    // Janela que atravessa a meia-noite (ex: 22h -> 7h)
    return h >= ACTIVE_HOUR_START || h < ACTIVE_HOUR_END;
  }

  // Modo allowlist: se allowlist_whatsapp.json existir, SÓ atende os números listados.
  isAllowedContact(from) {
    try {
      if (!fs.existsSync(ALLOWLIST_FILE)) return true; // sem allowlist = atende todos
      const raw = fs.readFileSync(ALLOWLIST_FILE, 'utf8');
      const data = JSON.parse(raw);
      const list = Array.isArray(data) ? data : (data.numbers || []);
      const num = String(from).replace(/[^0-9]/g, '');
      for (const item of list) {
        const allowed = String(item).replace(/[^0-9]/g, '');
        if (num && allowed && (num === allowed || num.endsWith(allowed) || allowed.endsWith(num))) {
          return true;
        }
      }
      return false;
    } catch (e) {
      return true; // em erro, não bloqueia (comportamento conservador de liberação)
    }
  }

  // Verifica se o envio pode ocorrer com base nos limites diários de volume.
  // Retorna { ok: boolean, motivo: string|null }.
  canSend(from) {
    this._rollDaily();
    const num = String(from).replace(/[^0-9]/g, '');
    const cfg = this.readRuntimeConfig() || {};
    const dailyLimit = Number(cfg.waDailyLimit || process.env.WA_DAILY_LIMIT || DAILY_OUTGOING_LIMIT);
    const maxContacts = Number(cfg.waMaxContacts || process.env.WA_MAX_CONTACTS || MAX_CONTACTS_PER_DAY);
    const perContact = Number(cfg.waPerContactDay || process.env.WA_PER_CONTACT_DAY || MAX_REPLIES_PER_CONTACT_DAY);
    if (this.daily.outgoing >= dailyLimit) {
      return { ok: false, motivo: 'LIMITE_DIARIO' };
    }
    if (this.daily.contactCount >= maxContacts && !this.daily.contacts[num]) {
      return { ok: false, motivo: 'LIMITE_CONTATOS' };
    }
    const n = this.daily.contacts[num] || 0;
    if (n >= perContact) {
      return { ok: false, motivo: 'LIMITE_CONTATO' };
    }
    return { ok: true, motivo: null };
  }

  markSent(from) {
    this._rollDaily();
    this.daily.outgoing++;
    const num = String(from).replace(/[^0-9]/g, '');
    if (!this.daily.contacts[num]) {
      this.daily.contacts[num] = 0;
      this.daily.contactCount++;
    }
    this.daily.contacts[num]++;
  }

  // Delay mínimo para contatos nunca atendidos (evita responder a muitos desconhecidos de uma vez)
  async waitNewContactCooldown(from) {
    const last = this.lastContactReply[from] || 0;
    if (!last) {
      await this.sleep(NEW_CONTACT_COOLDOWN_MS);
      return this.markContactReplied(from);
    }
    return Promise.resolve();
  }

  truncate(text) {
    if (!text) return text;
    if (typeof text !== 'string') text = String(text);
    return text.length > MAX_MSG_LEN ? text.substring(0, MAX_MSG_LEN) + '…' : text;
  }

  // Serializa os envios para não estourar o WhatsApp com mensagens simultâneas
  enqueueSend(fn) {
    this.sendQueue = this.sendQueue.then(() =>
      new Promise((resolve) => setTimeout(resolve, SEND_INTERVAL_MS))
    ).then(fn).catch((e) => {
      console.error('[WhatsApp] Erro ao enviar mensagem:', e.message);
    });
    return this.sendQueue;
  }

  // Aplica cooldown para o mesmo contato (evita respostas automáticas em rajada)
  waitContactCooldown(from) {
    const last = this.lastContactReply[from] || 0;
    const elapsed = Date.now() - last;
    if (elapsed < CONTACT_COOLDOWN_MS) {
      return this.sleep(CONTACT_COOLDOWN_MS - elapsed);
    }
    return Promise.resolve();
  }

  markContactReplied(from) {
    this.lastContactReply[from] = Date.now();
  }

  // Pequena pausa aleatória para simular comportamento humano
  humanDelay() {
    const ms = REPLY_DELAY_MIN_MS + Math.floor(Math.random() * (REPLY_DELAY_MAX_MS - REPLY_DELAY_MIN_MS + 1));
    return this.sleep(ms);
  }

  sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // Envio seguro: cooldown por contato + delay humano + fila serializada.
  // Retorna boolean (true = enviou, false = bloqueado por limite/horário/allowlist).
  async safeSend(client, from, text) {
    if (!this.isAllowedContact(from)) {
      console.log('[WhatsApp] Bloqueado pela allowlist:', from);
      return false;
    }
    if (!this.isWithinActiveHours()) {
      console.log('[WhatsApp] Fora do horário de funcionamento.');
      return false;
    }
    const chk = this.canSend(from);
    if (!chk.ok) {
      console.log(`[WhatsApp] Envio bloqueado (${chk.motivo}) para ${from}`);
      return false;
    }
    await this.waitNewContactCooldown(from);
    await this.waitContactCooldown(from);
    await this.humanDelay();
    await this.enqueueSend(() => client.sendMessage(from, this.truncate(text)));
    this.markContactReplied(from);
    this.markSent(from);
    return true;
  }

  // Le as configuracoes do WhatsApp gravadas pelo ERP (Minha Conta) via config.runtime.json.
  // Se o arquivo existir, ele e a fonte da verdade; caso contrario, usa o banco do NGRBOT.
  readRuntimeConfig() {
    try {
      const p = path.join(__dirname, '..', '..', 'config.runtime.json');
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        if (raw && raw.trim()) return JSON.parse(raw);
      }
    } catch (e) {
      console.error('[WhatsApp] erro ao ler config.runtime.json:', e.message);
    }
    return null;
  }

  setIO(io) {
    this.io = io;
  }

  getKey(userId, index) {
    return `${userId}_${index}`;
  }

  getSessionPath(userId, index) {
    const sessionDir = path.join(__dirname, '../../sessions', `user_${userId}`, `account_${index}`);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  async connect(userId, index = 0) {
    const key = this.getKey(userId, index);
    if (this.clients[key]) {
      return { alreadyConnected: true };
    }
    if (this.connecting[key]) {
      return { connecting: true };
    }

    this.connecting[key] = true;
    const sessionPath = this.getSessionPath(userId, index);

    try {
      const client = new Client({
        authStrategy: new LocalAuth({ dataPath: sessionPath }),
        puppeteer: {
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-extensions'
          ]
        },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        webVersionCache: {
          type: 'remote',
          remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        }
      });

      client.on('qr', async (qr) => {
        try {
          const qrBase64 = await qrcode.toDataURL(qr);
          console.log(`[WhatsApp] QR Code gerado para usuario ${userId}, conta ${index}`);
          if (this.io) {
            this.io.to(`user_${userId}`).emit('qr', { index, data: qrBase64 });
          }
        } catch (err) {
          console.error(`[WhatsApp] Erro ao processar QR:`, err.message);
        }
      });

      client.on('ready', () => {
        console.log(`[WhatsApp] Conectado: usuario ${userId}, conta ${index}`);
        this.connecting[key] = false;
        this.clients[key] = client;
        if (this.io) {
          this.io.to(`user_${userId}`).emit('status', { index, connected: true, message: `Conta ${index + 1} conectada!` });
          this.io.to(`user_${userId}`).emit('qr', { index, data: null });
        }
      });

      client.on('auth_failure', (msg) => {
        console.error(`[WhatsApp] Falha autenticacao usuario ${userId}, conta ${index}:`, msg);
        this.connecting[key] = false;
        delete this.clients[key];
        if (this.io) {
          this.io.to(`user_${userId}`).emit('status', { index, connected: false, message: `Falha: ${msg}` });
        }
      });

      client.on('error', (err) => {
        console.error(`[WhatsApp] Erro usuario ${userId}, conta ${index}:`, err.message);
        this.connecting[key] = false;
      });

      client.on('disconnected', async (reason) => {
        console.log(`[WhatsApp] Desconectado usuario ${userId}, conta ${index}: ${reason}`);
        this.connecting[key] = false;
        delete this.clients[key];
        const sessionPath = this.getSessionPath(userId, index);
        try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) {}
        if (this.io) {
          this.io.to(`user_${userId}`).emit('status', { index, connected: false, message: 'Desconectado' });
        }
      });

      client.on('message', async (message) => {
        if (message.from.includes('@g.us')) return;

        if (this.clients[key] && this.clients[key].info && this.clients[key].info.wid) {
          const myNumber = this.clients[key].info.wid._serialized;
          if (message.from._serialized === myNumber) return;
        }

        // Permitido pela allowlist? (não processa nem loga fora dela)
        if (!this.isAllowedContact(message.from)) {
          console.log('[WhatsApp] Ignorada (fora da allowlist):', message.from);
          return;
        }

        // Anti-eco: mesma mensagem repetida na mesma janela = spam, ignora.
        if (this.isRepeatMessage(message.from, message.body)) {
          console.log('[WhatsApp] Mensagem repetida ignorada (anti-spam):', message.from);
          return;
        }

        // Fora do horário de funcionamento não responde.
        if (!this.isWithinActiveHours()) {
          console.log('[WhatsApp] Fora do horário, mensagem de', message.from, 'ignorada.');
          return;
        }

        console.log(`[NGR] Mensagem recebida (conta ${index + 1}):`, message.body);

        try {
          const user = await User.findByPk(userId);
          if (!user) return;

          const rc = this.readRuntimeConfig();
          const msgLower = message.body.toLowerCase().trim();

          const userFlows = (rc && Array.isArray(rc.flows) && rc.flows.length) ? rc.flows : ((user.auto_flows) || []);
          const iaAtiva = rc ? (rc.aiActive !== false) : (user.ai_active === true || user.ai_active === 1 || user.ai_active === undefined || user.ai_active === null);

          console.log('[NGR] IA Ativa?', iaAtiva);

          for (var i = 0; i < userFlows.length; i++) {
            var flow = userFlows[i];
            if (flow.keyword && msgLower.includes(flow.keyword.toLowerCase())) {
              console.log('[NGR] >> FLUXO ACIONADO:', flow.keyword);
              await this.safeSend(client, message.from, flow.response);
              return;
            }
          }

          if (rc) {
            console.log('[NGR] >> IA ativa via config do ERP (Minha Conta)');
          } else {
            const subscription = await Subscription.findOne({ where: { userId: userId, status: 'active' } });
            const planType = subscription?.planType || 'pro';
            const isSmartPlan = planType === 'smart';
            if (isSmartPlan) {
              console.log('[NGR] >> PLANO SMART - IA BLOQUEADA');
              await this.safeSend(client, message.from, '🔒 *Recurso exclusivo do plano NGR Pro*\n\nFaça um upgrade para usar inteligência artificial!');
              return;
            }
          }

          const appConfig = require('../../config.json');
          const effectiveApiKey = (rc && rc.groqKey) ? rc.groqKey : (user.groq_key || process.env.GROQ_API_KEY || appConfig.groqApiKey || '');
          const effectiveModel = (rc && rc.model) ? rc.model : (user.selected_model || appConfig.model || 'groq/compound-mini');
          const promptText = (rc && rc.prompt) ? rc.prompt : (user.ai_prompt || 'Você é um assistente útil e amigável da NG Ruby. Responda de forma clara e objetiva.');

          if (iaAtiva && effectiveApiKey) {
            const useUserKey = user.groq_key ? 'chave do usuario' : 'chave padrao (config)';
            console.log('[NGR] >> CHAMANDO GROQ (' + useUserKey + ')...');

            try {
              const historyRecord = await ConversationHistory.findOne({
                where: { userId: userId, phoneNumber: message.from }
              });

              let messages = [];
              if (historyRecord && historyRecord.messages && historyRecord.messages.length > 0) {
                messages = [...historyRecord.messages];
                console.log('[NGR] Histórico do banco:', messages.length, 'mensagens');
              }

              const groq = new Groq({ apiKey: effectiveApiKey });
              const prompt = promptText;

              messages.push({ role: 'user', content: message.body });

              const apiMessages = [
                { role: 'system', content: prompt },
                ...messages
              ];

              const model = effectiveModel;
              console.log('[NGR] Usando modelo:', model);

              const completion = await groq.chat.completions.create({
                messages: apiMessages,
                model: model,
                temperature: 0.7,
                max_tokens: 200
              });

              const reply = completion.choices[0]?.message?.content;
              if (reply) {
                console.log('[NGR] >> RESPOSTA IA:', reply.substring(0, 50) + '...');

                messages.push({ role: 'assistant', content: reply });

                const messagesToSave = messages.slice(-5);

                if (historyRecord) {
                  historyRecord.messages = messagesToSave;
                  await historyRecord.save();
                } else {
                  await ConversationHistory.create({
                    userId: userId,
                    phoneNumber: message.from,
                    messages: messagesToSave
                  });
                }

                await this.safeSend(client, message.from, reply);
              } else {
                console.log('[NGR] >> Groq sem resposta, enviando menu');
                await this.safeSend(client, message.from, 'Olá! 👋 Bem-vindo ao NGR Bot!\n\n1 - Nossos Serviços\n2 - Falar com Suporte');
              }
            } catch (groqErr) {
              console.error('[NGR] ERRO GROQ:', groqErr.message);
              await this.safeSend(client, message.from, 'Olá! 👋 Bem-vindo ao NGR Bot!\n\n1 - Nossos Serviços\n2 - Falar com Suporte');
            }
            return;
          }

          console.log('[NGR] >> ENVIANDO MENU');
          await this.safeSend(client, message.from, 'Olá! 👋 Bem-vindo ao NGR Bot!\n\nEscolha uma opção:\n1 - Nossos Serviços\n2 - Falar com Suporte');

        } catch (err) {
          console.error('[NGR] ERRO:', err.message);
        }
      });

      client.initialize().catch((err) => {
        console.error(`[WhatsApp] Falha ao inicializar usuario ${userId}, conta ${index}:`, err.message);
        delete this.clients[key];
        this.connecting[key] = false;
        try { if (client.pupBrowser) client.pupBrowser.close(); } catch (e) {}
        if (this.io) {
          this.io.to(`user_${userId}`).emit('status', { index, connected: false, message: `Erro: ${err.message}` });
        }
      });

      console.log(`[WhatsApp] Iniciando conexao para usuario ${userId}, conta ${index}...`);
      return { success: true, connecting: true };
    } catch (error) {
      console.error(`[WhatsApp] Erro ao criar cliente usuario ${userId}, conta ${index}:`, error.message);
      this.connecting[key] = false;
      return { error: error.message };
    }
  }

  async disconnect(userId, index) {
    const key = this.getKey(userId, index);
    if (this.clients[key]) {
      try { await this.clients[key].destroy(); } catch (e) {}
    }
    delete this.clients[key];
    this.connecting[key] = false;
    const sessionPath = this.getSessionPath(userId, index);
    try { fs.rmSync(sessionPath, { recursive: true, force: true }); } catch (e) {}
    return { success: true };
  }

  async disconnectAll(userId) {
    for (let i = 0; i < MAX_ACCOUNTS; i++) {
      await this.disconnect(userId, i);
    }
  }

  getStatus(userId) {
    const statuses = [];
    for (let i = 0; i < MAX_ACCOUNTS; i++) {
      const key = this.getKey(userId, i);
      const client = this.clients[key];
      const connecting = !!this.connecting[key];
      statuses.push({
        index: i,
        connected: !!(client && client.info && client.info.pushname),
        connecting: connecting,
        number: client && client.info ? client.info.wid.user : null
      });
    }
    return statuses;
  }
}

module.exports = new WhatsAppService();