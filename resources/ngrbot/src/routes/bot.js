const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const BotConfig = require('../models/BotConfig');

router.get('/config', requireAuth, async (req, res) => {
  try {
    let config = await BotConfig.findOne({ where: { userId: req.session.userId } });
    if (!config) {
      config = await BotConfig.create({
        userId: req.session.userId,
        flows: [{
          id: "1",
          palavras: ["oi", "olá", "ola", "bom dia", "boa tarde", "boa noite", "menu", "início", "inicio"],
          resposta: "Olá! 👋 Bem-vindo ao NGR Bot!\n\nEscolha uma opção:\n1 - Nossos Serviços\n2 - Falar com Suporte"
        }]
      });
    }
    res.json({
      groqApiKey: config.groqApiKey ? '****' : null,
      promptSistema: config.promptSistema,
      flows: config.flows
    });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar config' });
  }
});

router.post('/config', requireAuth, async (req, res) => {
  try {
    const { groqApiKey, promptSistema, flows } = req.body;
    const updateData = {};
    if (groqApiKey !== undefined) updateData.groqApiKey = groqApiKey;
    if (promptSistema !== undefined) updateData.promptSistema = promptSistema;
    if (flows !== undefined) updateData.flows = flows;
    const [affected] = await BotConfig.update(updateData, { where: { userId: req.session.userId } });
    if (affected === 0) {
      await BotConfig.create({ userId: req.session.userId, ...updateData });
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar config' });
  }
});

module.exports = router;