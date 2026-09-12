const { User, Subscription } = require('../models');

const ADMIN_EMAIL = 'ngr.alboliver@gmail.com';
const TRIAL_DAYS = 7;

const isUserInTrial = (user) => {
  if (!user || !user.createdAt) return false;
  const createdDate = new Date(user.createdAt);
  const now = new Date();
  const diffTime = Math.abs(now - createdDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= TRIAL_DAYS;
};

const getTrialDaysRemaining = (user) => {
  if (!user || !user.createdAt) return 0;
  const createdDate = new Date(user.createdAt);
  const now = new Date();
  const diffTime = now - createdDate;
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const daysRemaining = TRIAL_DAYS - diffDays;
  return Math.max(0, daysRemaining);
};

const hasActivePaidSubscription = async (userId) => {
  const subscription = await Subscription.findOne({
    where: { userId, status: 'active' }
  });
  if (!subscription) return false;
  if (subscription.validUntil && new Date(subscription.validUntil) < new Date()) {
    await subscription.update({ status: 'expired' });
    return false;
  }
  return true;
};

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Não autenticado' });
  }
  next();
};

const isAdmin = async (userId) => {
  const user = await User.findByPk(userId);
  return user && user.email === ADMIN_EMAIL;
};

const requireSubscription = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.session.userId);
    if (user && user.email === ADMIN_EMAIL) {
      req.isAdmin = true;
      return next();
    }
    
    // Verifica se tem assinatura paga ativa
    const hasPaid = await hasActivePaidSubscription(req.session.userId);
    if (hasPaid) {
      const subscription = await Subscription.findOne({
        where: { userId: req.session.userId, status: 'active' }
      });
      req.subscription = subscription;
      return next();
    }
    
    // Se não tem assinatura paga, verifica trial
    const daysRemaining = getTrialDaysRemaining(user);
    console.log(`[Auth] Usuário ${req.session.userId} - Trial dias restantes: ${daysRemaining}`);
    
    if (daysRemaining > 0) {
      req.isTrial = true;
      req.daysRemaining = daysRemaining;
      return next();
    }
    
    // Trial expirou e não tem assinatura paga
    console.log(`[Auth] Acesso bloqueado - Trial expirado para usuário ${req.session.userId}`);
    return res.status(403).json({ 
      error: 'Período de teste acabou', 
      trialExpired: true,
      requiresPayment: true,
      message: 'Seu período de teste gratuito acabou. Escolha um plano para continuar usando o NGR BOT.'
    });
    
  } catch (error) {
    console.error('Erro requireSubscription:', error.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
};

module.exports = { requireAuth, requireSubscription, isAdmin, isUserInTrial, getTrialDaysRemaining, hasActivePaidSubscription, ADMIN_EMAIL };