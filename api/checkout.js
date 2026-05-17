// api/checkout.js — POST /api/checkout
// Creates a Stripe checkout session for the selected plan

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Plan → Stripe price config
// Replace price IDs with your actual Stripe Price IDs after setup
const PLANS = {
  essentials: {
    name:      'RoofIQ Essentials',
    mode:      'payment',                          // one-time
    price:     29700,                              // $297 in cents
    currency:  'usd',
  },
  growth: {
    name:      'RoofIQ Growth',
    mode:      'subscription',
    setup_fee: 29700,                              // $297 one-time setup
    price_id:  process.env.STRIPE_PRICE_GROWTH,   // $79/mo recurring price ID
  },
  pro: {
    name:      'RoofIQ Pro',
    mode:      'subscription',
    setup_fee: 29700,
    price_id:  process.env.STRIPE_PRICE_PRO,      // $149/mo recurring price ID
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).setHeaders(CORS).end();
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));
  if (req.method !== 'POST') return res.status(405).end();

  const { plan, name, company, email, website } = req.body;
  const planConfig = PLANS[plan];

  if (!planConfig) return res.status(400).json({ error: 'Invalid plan' });
  if (!email)      return res.status(400).json({ error: 'Email required' });

  const domain = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://roofiq.live';

  try {
    let sessionUrl;

    if (planConfig.mode === 'payment') {
      // One-time payment (Essentials)
      sessionUrl = await createPaymentSession({
        plan, name, company, email, website, planConfig, domain
      });
    } else {
      // Subscription with setup fee (Growth, Pro)
      sessionUrl = await createSubscriptionSession({
        plan, name, company, email, website, planConfig, domain
      });
    }

    return res.status(200).json({ url: sessionUrl });

  } catch (err) {
    console.error('[checkout]', err);
    return res.status(500).json({ error: 'Could not create checkout session' });
  }
}

async function stripeRequest(path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(flattenStripeParams(body)).toString(),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

// Stripe requires nested params as bracket notation
function flattenStripeParams(obj, prefix = '') {
  return Object.entries(obj).reduce((acc, [key, val]) => {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (val !== null && val !== undefined) {
      if (typeof val === 'object' && !Array.isArray(val)) {
        Object.assign(acc, flattenStripeParams(val, fullKey));
      } else {
        acc[fullKey] = val;
      }
    }
    return acc;
  }, {});
}

async function createPaymentSession({ plan, name, company, email, website, planConfig, domain }) {
  const session = await stripeRequest('checkout/sessions', {
    mode:                 'payment',
    customer_email:       email,
    success_url:          `${domain}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:           `${domain}/#pricing`,
    'line_items[0][price_data][currency]':     'usd',
    'line_items[0][price_data][product_data][name]': planConfig.name,
    'line_items[0][price_data][product_data][description]': 'One-time setup · No monthly fee',
    'line_items[0][price_data][unit_amount]':  planConfig.price,
    'line_items[0][quantity]':                 1,
    'metadata[plan]':    plan,
    'metadata[name]':    name || '',
    'metadata[company]': company || '',
    'metadata[email]':   email,
    'metadata[website]': website || '',
  });
  return session.url;
}

async function createSubscriptionSession({ plan, name, company, email, website, planConfig, domain }) {
  const items = [{ price: planConfig.price_id, quantity: 1 }];

  const sessionParams = {
    mode:           'subscription',
    customer_email: email,
    success_url:    `${domain}/welcome?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:     `${domain}/#pricing`,
    'metadata[plan]':    plan,
    'metadata[name]':    name || '',
    'metadata[company]': company || '',
    'metadata[email]':   email,
    'metadata[website]': website || '',
  };

  // Add subscription items
  items.forEach((item, i) => {
    sessionParams[`line_items[${i}][price]`]    = item.price;
    sessionParams[`line_items[${i}][quantity]`] = item.quantity;
  });

  // Add setup fee as invoice item if needed
  if (planConfig.setup_fee) {
    sessionParams['subscription_data[trial_period_days]'] = 0;
  }

  const session = await stripeRequest('checkout/sessions', sessionParams);
  return session.url;
}
