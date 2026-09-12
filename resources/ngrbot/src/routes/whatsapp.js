const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth');
const whatsappService = require('../services/whatsapp');

router.post('/connect/:index(\\d)', requireAuth, async (req, res) => {
  const index = parseInt(req.params.index);
  if (index !== 0) return res.status(400).json({ error: 'Apenas uma conta WhatsApp permitida (índice 0)' });
  console.log(`[WhatsApp Route] POST /connect/${index} - usuario ${req.session.userId}`);
  try {
    const result = await whatsappService.connect(req.session.userId, index);
    res.json(result);
  } catch (error) {
    console.error(`[WhatsApp Route] Erro usuario ${req.session.userId}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/disconnect/:index(\\d)', requireAuth, async (req, res) => {
  const index = parseInt(req.params.index);
  if (index !== 0) return res.status(400).json({ error: 'Apenas uma conta WhatsApp permitida (índice 0)' });
  console.log(`[WhatsApp Route] POST /disconnect/${index} - usuario ${req.session.userId}`);
  try {
    const result = await whatsappService.disconnect(req.session.userId, index);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/status', requireAuth, (req, res) => {
  const statuses = whatsappService.getStatus(req.session.userId);
  res.json(statuses);
});

module.exports = router;