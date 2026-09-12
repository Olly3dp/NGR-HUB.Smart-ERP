const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');
require('dotenv').config();

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
if (!MP_ACCESS_TOKEN) {
  console.error('[MercadoPago] Faltando MP_ACCESS_TOKEN no ambiente (.env).');
}
const mpClient = new MercadoPagoConfig({ accessToken: MP_ACCESS_TOKEN || '' });

const TRIAL_DAYS = 7;

const PLANS = {
  smart: {
    id: 'smart',
    name: 'NGR Smart',
    description: 'ERP completo (sem WhatsApp)',
    price: 97.00
  },
  pro: {
    id: 'pro',
    name: 'NGR Pro',
    description: 'ERP completo + WhatsApp com IA',
    price: 147.00
  }
};

// Tolerância para comparação de floats (R$ 0,01)
const PRICE_TOLERANCE = 0.02;

const BACK_URL = process.env.MP_BACK_URL || 'http://localhost:3000/dashboard';

// Mapa inverso: preço esperado → nome do plano (para antifraude no webhook)
const EXPECTED_PRICES = { smart: PLANS.smart.price, pro: PLANS.pro.price };

// Verifica se o valor pago corresponde ao plano declarado (antifraude: evitar R$1 → plano R$147)
function validatePaymentAmount(planType, transactionAmount) {
  const expected = EXPECTED_PRICES[planType];
  if (!expected || !transactionAmount) return false;
  return Math.abs(expected - transactionAmount) < PRICE_TOLERANCE;
}

async function createSubscription(userId, email, name, planType = 'pro', isFirstMonth = false) {
  try {
    const plan = PLANS[planType] || PLANS.pro;

    let unitPrice = plan.price;
    if (isFirstMonth && plan.firstMonthPrice) {
      unitPrice = plan.firstMonthPrice;
    }

    // Preferences (pagamento único via PIX) - MercadoPago SDK v3
    const preferenceBody = {
      items: [{
        title: `${plan.name} - Assinatura Mensal${isFirstMonth && plan.firstMonthPrice ? ' (Primeiro Mês)' : ''}`,
        description: plan.description,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: unitPrice
      }],
      payer: {
        email: email,
        name: name,
        identification: {
          type: 'CPF',
          number: '12345678909'
        }
      },
      payment_methods: {
        excluded_payment_types: [{ id: 'ticket' }, { id: 'credit_card' }, { id: 'debit_card' }, { id: 'atm' }]
      },
      back_urls: {
        success: BACK_URL,
        pending: BACK_URL,
        failure: BACK_URL
      },
      external_reference: JSON.stringify({ userId: userId, plan: planType, isFirstMonth: isFirstMonth }),
      notification_url: process.env.MP_WEBHOOK_URL || 'http://localhost:3000/webhook/mercadopago',
      auto_return: 'approved'
    };
    console.log('[MercadoPago] Enviando preference:', JSON.stringify(preferenceBody));

    const preferenceApi = new Preference(mpClient);
    const result = await preferenceApi.create({ body: preferenceBody });

    console.log('[MercadoPago] Resultado:', JSON.stringify(result).substring(0, 300));

    const response = result.response || result;
    const initPoint = response.init_point || response.sandbox_init_point || response.point_of_interaction?.transaction_data?.ticket_url || response.point_of_interaction?.transaction_data?.url || response.long_url;
    if (!initPoint) {
      throw new Error('URL de pagamento não gerada');
    }

    return {
      preferenceId: response.id,
      initPoint: initPoint,
      plan: planType
    };
  } catch (error) {
    console.error('[MercadoPago] Erro createSubscription:', error.message);
    throw new Error('Erro de conexão com MercadoPago: ' + error.message);
  }
}

async function processWebhook(payload) {
  try {
    if (payload.type !== 'payment') return null;

    const paymentId = payload.data.id;
    const paymentApi = new Payment(mpClient);
    const p = await paymentApi.get({ id: paymentId });

    // SDK v3 pode retornar direto ou em .body
    const status = p.status ?? p.body?.status;
    const statusDetail = p.status_detail ?? p.body?.status_detail;
    const transactionAmount = p.transaction_amount ?? p.body?.transaction_amount;
    const paymentMethodId = p.payment_method_id ?? p.body?.payment_method_id;
    const externalRef = p.external_reference ?? p.body?.external_reference;
    const payerEmail = p.payer?.email ?? p.body?.payer?.email;

    let userId, plan = 'pro', isFirstMonth = false;
    try {
      const parsed = JSON.parse(externalRef);
      userId = parsed.userId;
      plan = parsed.plan || 'pro';
      isFirstMonth = parsed.isFirstMonth || false;
    } catch (e) {
      userId = externalRef;
    }

    return {
      paymentId,
      status,
      statusDetail,
      transactionAmount,
      paymentMethodId,
      userId,
      plan,
      isFirstMonth,
      payerEmail
    };
  } catch (error) {
    console.error('Erro MP processWebhook:', error.message);
    return null;
  }
}

function isUserInTrial(user) {
  if (!user || !user.createdAt) return false;
  const createdDate = new Date(user.createdAt);
  const now = new Date();
  const diffTime = Math.abs(now - createdDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays <= TRIAL_DAYS;
}

module.exports = { createSubscription, processWebhook, isUserInTrial, validatePaymentAmount, PLANS };