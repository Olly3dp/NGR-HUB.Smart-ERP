const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { User, Subscription, BotConfig } = require('../models');
const { requireAuth, ADMIN_EMAIL } = require('../middlewares/auth');

// Rate limit para login: 5 tentativas a cada 15 minutos
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }
    if (await User.findOne({ where: { email } })) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }
    const user = await User.create({
      name,
      email,
      password: await bcrypt.hash(password, 10)
    });
    await Subscription.create({ userId: user.id, status: 'pending' });
    await BotConfig.create({
      userId: user.id,
      flows: [{
        id: "1",
        palavras: ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu", "início", "inicio"],
        resposta: "Olá! 👋 Bem-vindo ao NGR Bot!\n\nEscolha uma opção:\n1 - Nossos Serviços\n2 - Falar com Suporte"
      }]
    });
    req.session.userId = user.id;
    res.json({ success: true, user: { id: user.id, name: user.name, email: user.email } });
  } catch (error) {
    console.error('Erro register:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha obrigatórios' });
    }
    const user = await User.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const isAdminUser = email === ADMIN_EMAIL;
    req.session.userId = user.id;
    res.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
      isAdmin: isAdminUser
    });
  } catch (error) {
    console.error('Erro login:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

router.get('/session', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, userId: req.session.userId });
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    res.json({ id: user.id, name: user.name, email: user.email });
  } catch (error) {
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;