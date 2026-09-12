const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireAuth, ADMIN_EMAIL, getTrialDaysRemaining, hasActivePaidSubscription } = require('../middlewares/auth');
const { User, Subscription } = require('../models');
const mercadoPagoService = require('../services/mercadopago');

router.get('/plans', (req, res) => {
  res.json(mercadoPagoService.PLANS);
});

// Rate limit para checkout: 5 tentativas a cada 15 minutos
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas de pagamento. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/create-checkout', checkoutLimiter, requireAuth, async (req, res) => {
  try {
    const { plan } = req.body;
    const user = await User.findByPk(req.session.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (user.email === ADMIN_EMAIL) {
      return res.json({ success: true, isAdmin: true, message: 'Admin - acesso permanente' });
    }
    
    // VALIDAÇÃO SERVER-SIDE (Anti-Fraude) - Ignora preço do frontend
    // O servidor força o preço correto baseado no plano
    let planType = 'pro';
    if (plan === 'smart' || plan === 'fluxos' || plan === 'NGR Smart') {
      planType = 'smart'; // R$ 97,00 ERP (sem WhatsApp)
    } else if (plan === 'pro' || plan === 'pro-ia' || plan === 'NGR Pro AI' || plan === 'NGR Pro' || plan === 'proplus' || plan === 'NGR Pro+' || plan === 'pro+') {
      planType = 'pro'; // R$ 147,00 ERP + WhatsApp com IA
    } else {
      // Default: pro
      planType = 'pro';
    }
    
    console.log(`[Checkout] Plano recebido: ${plan} -> Forçado para: ${planType} (preço definido pelo servidor)`);
    
    // Verifica se é o primeiro mês (usuário não tem assinatura ativa paga anterior)
    const existingSub = await Subscription.findOne({ where: { userId: user.id } });
    const isFirstMonth = !existingSub || !existingSub.mpPaymentId;
    
    console.log(`[Checkout] isFirstMonth: ${isFirstMonth}`);
    
    // Verifica se está em período de trial - pode fazer upgrade
    const inTrial = mercadoPagoService.isUserInTrial(user);
    if (inTrial) {
      console.log(`[Checkout] Usuário ${user.id} em trial, gerando PIX para upgrade`);
    }
    
    console.log(`[Checkout] Criando preferência para usuario ${user.id}, plano: ${planType}, primeiroMes: ${isFirstMonth}`);
    
    const result = await mercadoPagoService.createSubscription(user.id, user.email, user.name, planType, isFirstMonth);
    console.log(`[Checkout] Preferência criada: ${result.preferenceId}`);
    
    await Subscription.update({ mpPreferenceId: result.preferenceId, planType }, { where: { userId: user.id } });
    res.json({ success: true, checkoutUrl: result.initPoint });
  } catch (error) {
    console.error('Erro checkout:', error.message);
    res.status(500).json({ error: error.message || 'Erro ao criar checkout - verifique sua conexão' });
  }
});

router.get('/status', requireAuth, async (req, res) => {
  try {
    const user = await User.findByPk(req.session.userId);
    console.log(`[Subscription Status] Usuario ${req.session.userId}`);
    
    if (user && user.email === ADMIN_EMAIL) {
      return res.json({ status: 'active', validUntil: 'indefinido', isActive: true, isAdmin: true, planName: 'Admin Premium' });
    }
    
    // Verifica se tem assinatura ativa (paga)
    const hasPaid = await hasActivePaidSubscription(req.session.userId);
    if (hasPaid) {
      const sub = await Subscription.findOne({ where: { userId: req.session.userId, status: 'active' } });
      const planNames = { smart: 'NGR Smart', pro: 'NGR Pro' };
      const planName = planNames[sub.planType] || 'NGR Pro';
      const daysRemaining = Math.ceil((new Date(sub.validUntil) - new Date()) / (1000 * 60 * 60 * 24));
      console.log(`[Subscription Status] ASSINATURA ATIVA - ${planName}, ${daysRemaining} dias`);
      return res.json({ 
        status: 'active', 
        planType: sub.planType,
        planName: planName,
        validUntil: sub.validUntil, 
        isActive: true, 
        daysRemaining: daysRemaining
      });
    }
    
    // Verifica trial
    const daysRemaining = getTrialDaysRemaining(user);
    if (daysRemaining > 0) {
      console.log(`[Subscription Status] TRIAL ATIVO - ${daysRemaining} dias restantes`);
      return res.json({ 
        status: 'trial', 
        planName: 'Trial',
        validUntil: new Date(user.createdAt.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(), 
        isActive: true, 
        isTrial: true,
        daysRemaining: daysRemaining
      });
    }
    
    // Trial expirou
    console.log(`[Subscription Status] TRIAL EXPIRADO - Acesso bloqueado`);
    return res.json({ 
      status: 'expired', 
      trialExpired: true,
      planName: 'Nenhum',
      isActive: false, 
      isTrial: false,
      daysRemaining: 0,
      message: 'Seu período de teste gratuito acabou. Escolha um plano para continuar usando o NGR BOT.'
    });
  } catch (error) {
    console.error('Erro status:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

// Verifica se um pagamento foi confirmado (chamado pelo ERP desktop antes de ativar)
// Requer autenticação e um preferenceId gerado pelo checkout
router.get('/verify-payment', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId;
    const sub = await Subscription.findOne({ where: { userId } });
    if (!sub) return res.json({ verified: false, reason: 'no_subscription' });

    // Pagamento confirmado via webhook com status 'active'
    if (sub.status === 'active' && sub.mpPaymentId) {
      // Verificar se ainda não expirou
      if (sub.validUntil && new Date(sub.validUntil) > new Date()) {
        const daysRemaining = Math.ceil((new Date(sub.validUntil) - new Date()) / (1000 * 60 * 60 * 24));
        console.log(`[Verify] Pagamento confirmado: usuario=${userId}, plano=${sub.planType}, dias=${daysRemaining}`);
        return res.json({ verified: true, planType: sub.planType, daysRemaining, validUntil: sub.validUntil });
      }
      return res.json({ verified: false, reason: 'expired' });
    }

    // Pagamento reembolsado/cancelado
    if (sub.status === 'revoked') {
      console.log(`[Verify] Pagamento revocado: usuario=${userId}`);
      return res.json({ verified: false, reason: 'revoked' });
    }

    // Ainda pendente (PIX agendado ou aguardando confirmação)
    if (sub.status === 'pending') {
      return res.json({ verified: false, reason: 'pending', message: 'Aguardando confirmação do pagamento PIX' });
    }

    return res.json({ verified: false, reason: sub.status });
  } catch (error) {
    console.error('Erro verify-payment:', error.message);
    res.status(500).json({ error: 'Erro interno' });
  }
});

module.exports = router;