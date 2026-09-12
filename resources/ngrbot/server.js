/**
 * NGR BOT - Micro-SaaS Multi-Tenant
 * Servidor Principal - NG Ruby
 */

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const bcrypt = require('bcryptjs');

const { sequelize, User, Subscription, BotConfig, ConversationHistory } = require('./src/models');
const authRoutes = require('./src/routes/auth');
const subscriptionRoutes = require('./src/routes/subscription');
const whatsappRoutes = require('./src/routes/whatsapp');
const botRoutes = require('./src/routes/bot');
const whatsappService = require('./src/services/whatsapp');

// Modelos ativos permitidos
const ACTIVE_MODELS = ['groq/compound-mini', 'groq/compound', 'qwen/qwen3.6-27b'];

// Ambiente
const NODE_ENV = process.env.NODE_ENV || 'development';
const BASE_URL = process.env.BASE_URL || (NODE_ENV === 'production' ? 'https://ngrbot.ngruby.com.br' : 'http://localhost:3000');
const IS_PRODUCTION = NODE_ENV === 'production';

// Credenciais a partir do ambiente (.env). Fallback apenas para bootstrap local.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'ngr.alboliver@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '@NGR2020b';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ngr-bot-saas-secret-2024';

console.log(`[ENV] Ambiente: ${NODE_ENV}`);
console.log(`[ENV] Base URL: ${BASE_URL}`);

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({
    table: 'sessions',
    dir: path.join(__dirname, 'database'),
    concurrentDB: true
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000, httpOnly: true }
}));
app.use(express.static(path.join(__dirname, 'public')));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

whatsappService.setIO(io);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/bot', botRoutes);

// ── Endpoint interno: verificação de pagamento (ERP desktop → ngrbot local) ──
// Aceita SOMENTE de localhost. Sem auth necessária — dados somente leitura.
app.get('/api/subscription/internal/status', async (req, res) => {
  // Segurança: bloquear qualquer request que não venha de localhost
  const ip = req.ip || req.connection?.remoteAddress || '';
  const isLocal = ip.includes('127.0.0.1') || ip.includes('::1') || ip.includes('::ffff:127.0.0.1');
  if (!isLocal) {
    return res.status(403).json({ error: 'Acesso negado: apenas localhost' });
  }

  try {
    const { userId, email, installId } = req.query;
    if (!userId && !email) {
      return res.status(400).json({ error: 'Parametros obrigatorios: userId ou email' });
    }

    const { User, Subscription } = require('./src/models');

    // Buscar usuario por email ou ID
    let user;
    if (email) {
      user = await User.findOne({ where: { email } });
    } else {
      user = await User.findByPk(parseInt(userId));
    }
    if (!user) return res.json({ status: 'no_user', active: false });

    // Admin nunca expira
    if (user.email === ADMIN_EMAIL) {
      return res.json({ status: 'active', active: true, planType: 'master', daysRemaining: 9999, isAdmin: true });
    }

    // Verificar assinatura ativa
    const sub = await Subscription.findOne({ where: { userId: user.id, status: 'active' } });
    if (sub && sub.validUntil && new Date(sub.validUntil) > new Date()) {
      const daysRemaining = Math.ceil((new Date(sub.validUntil) - new Date()) / (1000 * 60 * 60 * 24));

      return res.json({
        status: 'active', active: true, planType: sub.planType,
        daysRemaining, validUntil: sub.validUntil, installId: installId || ''
      });
    }

    // Verificar trial
    if (user.createdAt) {
      const trialDays = 7;
      const created = new Date(user.createdAt);
      const now = new Date();
      const daysUsed = Math.ceil((now - created) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, trialDays - daysUsed);
      if (daysRemaining > 0) {
        return res.json({ status: 'trial', active: true, daysRemaining, isTrial: true });
      }
    }

    return res.json({ status: 'expired', active: false });
  } catch (error) {
    console.error('[Internal] Erro status:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Mercado Pago Webhook — Verificação robusta de pagamentos
app.post('/webhook/mercadopago', async (req, res) => {
  // MP exige resposta 200 rápida (independente de sucesso/erro)
  res.status(200).json({ received: true });

  try {
    const mpService = require('./src/services/mercadopago');
    const result = await mpService.processWebhook(req.body);
    if (!result) return;

    const { paymentId, status, statusDetail, transactionAmount, paymentMethodId, userId, plan, isFirstMonth } = result;
    const planType = plan || 'pro';

    // ── PAGAMENTO APROVADO (PIX efetivamente liquidado) ──
    if (status === 'approved' && statusDetail === 'accredited') {
      // 1. Verificar que o valor pago confere com o plano (antifraude: R$1 → plano R$147)
      if (!mpService.validatePaymentAmount(planType, transactionAmount)) {
        console.error(`[FRAUD] Valor incompativel: plano=${planType}, esperado=${mpService.PLANS[planType]?.price}, pago=R$${transactionAmount}, paymentId=${paymentId}`);
        return;
      }

      // 2. Verificar que é PIX (método de pagamento)
      if (paymentMethodId && paymentMethodId !== 'pix' && paymentMethodId !== 'account_money') {
        console.log(`[WEBHOOK] Metodo de pagamento nao-PIX ignorado: ${paymentMethodId}, paymentId=${paymentId}`);
        return;
      }

      const uid = parseInt(userId);
      if (!uid) {
        console.error(`[WEBHOOK] userId invalido: ${userId}, paymentId=${paymentId}`);
        return;
      }

      // 3. Idempotencia: nao processar o mesmo pagamento duas vezes
      const existing = await Subscription.findOne({ where: { mpPaymentId: String(paymentId) } });
      if (existing) {
        console.log(`[WEBHOOK] Pagamento ${paymentId} ja processado (idempotente), ignorando.`);
        return;
      }

      // 4. Ativar: 30 dias a partir de HOJE (nao do pagamento antigo)
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 30);

      await Subscription.update(
        { status: 'active', mpPaymentId: String(paymentId), validUntil, planType },
        { where: { userId: uid } }
      );

      // Sincronizar campo legado do User (compatibilidade)
      try {
        const { User } = require('./src/models');
        await User.update({ subscription_active: true }, { where: { id: uid } });
      } catch {}

      console.log(`[WEBHOOK] Assinatura ATIVADA: usuario=${uid}, plano=${planType}, ate=${validUntil.toISOString()}, valor=R$${transactionAmount}, pagamento=${paymentId}`);
      return;
    }

    // ── REEMBOLSO / CANCELAMENTO / CHARGEBACK → BLOQUEAR ──
    if (['refunded', 'cancelled', 'charged_back'].includes(status)) {
      const uid = parseInt(userId);
      if (uid) {
        await Subscription.update(
          { status: 'revoked', mpPaymentId: String(paymentId) },
          { where: { userId: uid, status: 'active' } }
        );
        try {
          const { User } = require('./src/models');
          await User.update({ subscription_active: false }, { where: { id: uid } });
        } catch {}
        console.log(`[WEBHOOK] Assinatura REVOCADE: usuario=${uid}, status=${status}, pagamento=${paymentId}`);
      }
      return;
    }

    // ── PIX AGENDADO / PENDENTE → NAO ATIVAR ──
    if (status === 'pending' || statusDetail === 'pending_waiting_transfer') {
      console.log(`[WEBHOOK] PIX agendado/pendente, NAO ativando: usuario=${userId}, paymentId=${paymentId}, statusDetail=${statusDetail}`);
      return;
    }

    console.log(`[WEBHOOK] Evento ignorado: status=${status}, statusDetail=${statusDetail}, paymentId=${paymentId}`);
  } catch (error) {
    console.error('[WEBHOOK] Erro processando notificacao:', error.message);
  }
});

// API Profile
app.get('/api/profile', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
  try {
    const user = await User.findByPk(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    res.json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

// API User Data (para dashboard)
app.get('/api/user-data', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const user = await User.findByPk(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ 
      name: user.name, 
      email: user.email, 
      groq_key: user.groq_key || '', 
      ai_prompt: user.ai_prompt || '', 
      subscription_active: !!user.subscription_active 
    });
  } catch (error) {
    console.error('Erro ao buscar dados do usuário:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Salvar chave Groq
app.post('/api/save-groq', async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
  try {
    const { groq_key } = req.body;
    if (!groq_key) return res.status(400).json({ error: 'Chave obrigatoria' });
    const user = await User.findByPk(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    user.groq_key = groq_key;
    await user.save();
    console.log(`Groq key salva para usuario ${req.session.userId}`);
    res.json({ success: true, message: 'Configuracoes atualizadas com sucesso!' });
  } catch (error) {
    console.error('Erro ao salvar groq key:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Salvar configuracoes de IA (groq_key + ai_prompt + ai_active + auto_flows + selected_model)
app.post('/api/settings/save-ai', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
    const user = await User.findByPk(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });
    const { groq_key, ai_prompt, ai_active, auto_flows, selected_model } = req.body;
    console.log('[save-ai] Recebido:', { groq_key: !!groq_key, ai_prompt: !!ai_prompt, ai_active, auto_flows: auto_flows?.length, selected_model });
    const updateData = {};
    if (groq_key !== undefined) updateData.groq_key = groq_key;
    if (ai_prompt !== undefined) updateData.ai_prompt = ai_prompt;
    if (ai_active !== undefined) updateData.ai_active = ai_active;
    if (auto_flows !== undefined) updateData.auto_flows = auto_flows;
    if (selected_model !== undefined) {
      // Valida apenas modelos ativos
      const modelValido = ACTIVE_MODELS.includes(selected_model);
      if (modelValido) {
        updateData.selected_model = selected_model;
      } else {
        console.log('[save-ai] Modelo inválido, usando padrão');
        updateData.selected_model = 'groq/compound-mini';
      }
    }
    await User.update(updateData, { where: { id: req.session.userId } });
    
    // Verifica se foi salvo
    const updated = await User.findByPk(req.session.userId);
    console.log('[save-ai] Salvo - ai_active:', updated.ai_active, 'selected_model:', updated.selected_model);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar configs de IA:', error.message);
    res.status(500).json({ error: 'Erro ao salvar no banco' });
  }
});

// API: Salvar histórico de conversa
app.post('/api/conversation/save', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
    const { phone_number, messages } = req.body;
    if (!phone_number || !messages) return res.status(400).json({ error: 'Dados incompletos' });
    
    // Mantém apenas últimas 5 mensagens
    const messagesSlice = messages.slice(-5);
    
    // Busca ou cria histórico
    let history = await ConversationHistory.findOne({
      where: { userId: req.session.userId, phoneNumber: phone_number }
    });
    
    if (history) {
      history.messages = messagesSlice;
      await history.save();
    } else {
      await ConversationHistory.create({
        userId: req.session.userId,
        phoneNumber: phone_number,
        messages: messagesSlice
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar histórico:', error.message);
    res.status(500).json({ error: 'Erro ao salvar' });
  }
});

// API: Buscar histórico de conversa
app.get('/api/conversation/:phone', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Nao autenticado' });
    const phone = req.params.phone;
    
    const history = await ConversationHistory.findOne({
      where: { userId: req.session.userId, phoneNumber: phone }
    });
    
    res.json({ messages: history ? history.messages : [] });
  } catch (error) {
    console.error('Erro ao buscar histórico:', error.message);
    res.status(500).json({ error: 'Erro ao buscar' });
  }
});

// API: Atualizar avatar do usuário
app.post('/api/user/avatar', async (req, res) => {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Não autenticado' });
    const { avatar_url } = req.body;
    if (!avatar_url) return res.status(400).json({ error: 'Avatar não fornecido' });
    
    await User.update({ avatar_url }, { where: { id: req.session.userId } });
    res.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar avatar:', error.message);
    res.status(500).json({ error: 'Erro ao salvar avatar' });
  }
});

// Page Routes
// O NGRBOT agora roda embutido como modulo do ERP (NGR HUB). A autenticacao
// fica no ERP (landing page/Minha Conta). Aqui, sem sessao, autenticamos o
// admin automaticamente para o webview abrir direto na Conexao WhatsApp.
async function ensureLocalSession(req, res, next) {
  try {
    if (!req.session.userId) {
      const admin = await User.findOne({ where: { email: ADMIN_EMAIL } });
      if (admin) {
        req.session.userId = admin.id;
      }
    }
  } catch (e) {
    console.error('[AuthLocal]', e.message);
  }
  next();
}

app.get('/', ensureLocalSession, (req, res) => res.redirect('/dashboard'));
app.get('/login', (req, res) => res.redirect('/dashboard'));
app.get('/cadastro', (req, res) => res.redirect('/dashboard'));
app.get('/dashboard', ensureLocalSession, async (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  try {
    const user = await User.findByPk(req.session.userId);
    if (!user) return res.redirect('/login');
    const subscription = await Subscription.findOne({ where: { userId: user.id, status: 'active' } });
    const planType = subscription?.planType || null;
    const isSmartPlan = planType === 'fluxos';
    res.render('dashboard', { user: { id: user.id, name: user.name, email: user.email, avatar_url: user.avatar_url || null, hasGroq: !!user.groq_key, groq_key: user.groq_key || '', ai_prompt: user.ai_prompt || '', subscription_active: !!user.subscription_active, ai_active: user.ai_active !== false, auto_flows: user.auto_flows || [], selected_model: user.selected_model || 'groq/compound-mini', planType: planType, isSmartPlan: isSmartPlan } });
  } catch (error) {
    res.redirect('/login');
  }
});

// Socket.IO Rooms
io.on('connection', (socket) => {
  socket.on('join-user', (userId) => {
    socket.join(`user_${userId}`);
  });
});

// Previne crash fatal do servidor (ex: "Execution context was destroyed" do puppeteer)
process.on('uncaughtException', (err) => {
  console.error('[FATAL NAO CAPTURADO]', err?.stack || err?.message || err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[REJEICAO NAO TRATADA]', reason?.stack || reason?.message || reason);
});

// Error handling middleware - captures all unhandled errors
app.use((err, req, res, next) => {
  console.error('[ERRO CRITICO]', err.stack || err.message || err);
  res.status(500).send(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ops! Algo deu errado - NGR Bot</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; }
    .container { text-align: center; padding: 2rem; max-width: 500px; }
    .icon { font-size: 4rem; margin-bottom: 1rem; }
    h1 { font-size: 1.5rem; color: #ef4444; margin-bottom: 0.5rem; }
    p { color: #9ca3af; margin-bottom: 1.5rem; }
    .btn { background: #eab308; color: #000; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; display: inline-block; }
    .btn:hover { background: #ca8a04; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">⚠️</div>
    <h1>Ops! Algo deu errado</h1>
    <p>Estamos trabalhando para resolver o problema. Tente novamente em alguns momentos.</p>
    <a href="/dashboard" class="btn">Voltar ao Dashboard</a>
  </div>
</body>
</html>`);
});

// Inicializacao
const PORT = process.env.PORT || 3000;

async function createAdminUser() {
  try {
    const existing = await User.findOne({ where: { email: ADMIN_EMAIL } });
    if (!existing) {
      const admin = await User.create({
        name: 'Alison B Oliver',
        email: ADMIN_EMAIL,
        password: await bcrypt.hash(ADMIN_PASSWORD, 10),
        subscription_active: true,
        ai_active: true,
        selected_model: 'groq/compound-mini',
        auto_flows: [
          { keyword: '1', response: '📋 *Nossos Serviços*\n\n• Desenvolvimento Web\n• Chatbots IA\n• Sistemas Personalizados\n\nQual serviço gostaria de contratar?' },
          { keyword: '2', response: '📞 *Fale com nosso suporte*\n\nEmail: contato@ngruby.com\nWhatsApp: (11) 99999-9999' },
          { keyword: 'menu', response: '📋 *Menu Principal*\n\n1 - Nossos Serviços\n2 - Falar com Suporte\n3 - fale com IA' }
        ]
      });
      await Subscription.create({ userId: admin.id, status: 'active', validUntil: new Date('2099-12-31') });
      await BotConfig.create({
        userId: admin.id,
        flows: [{
          id: "1",
          palavras: ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu", "início", "inicio"],
          resposta: "Olá! 👋 Bem-vindo ao NGR Bot!\n\nEscolha uma opção:\n1 - Nossos Serviços\n2 - Falar com Suporte"
        }]
      });
      console.log('Conta master inicializada com sucesso.');
    }
  } catch (error) {
    console.error('Erro ao criar admin:', error.message);
  }
}

async function startServer() {
  try {
    await sequelize.query('PRAGMA foreign_keys = OFF');
    await sequelize.sync({ alter: true });
    await sequelize.query('PRAGMA foreign_keys = ON');
    await createAdminUser();
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔══════════════════════════════════════════════════════╗
║  NGR BOT - SAAS MULTI-TENANT                        ║
║  NG RUBY - Solucoes Tecnologicas                    ║
║                                                      ║
║  Servidor: ${IS_PRODUCTION ? BASE_URL : 'http://localhost:' + PORT}     ║
║  Ambiente: ${NODE_ENV}                                  ║
╚══════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('Erro fatal:', error.message);
    process.exit(1);
  }
}

startServer();