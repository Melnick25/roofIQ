// api/checkout.js — POST /api/checkout
// Creates Stripe checkout session — early bird or full pricing based on is_early flag

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).setHeaders(CORS).end();
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));
  if (req.method !== 'POST') return res.status(405).end();

  const { plan, email, company, name, website, is_early } = req.body;
  if (!plan || !email) return res.status(400).json({ error: 'Plan and email required' });

  const domain = 'https://roofiq.live';
  const early  = !!is_early;

  // Price ID map from Stripe
  const PRICE_IDS = {
    essentials: {
      setup: early
        ? process.env.STRIPE_PRICE_ESSENTIALS_EARLY   // $297
        : process.env.STRIPE_PRICE_ESSENTIALS_FULL,   // $497
      monthly: null,  // no recurring for essentials
    },
    growth: {
      setup: early
        ? process.env.STRIPE_PRICE_GROWTH_EARLY       // $297
        : process.env.STRIPE_PRICE_GROWTH_FULL,       // $697
      monthly: process.env.STRIPE_PRICE_GROWTH_MONTHLY, // $79/mo
    },
    pro: {
      setup: early
        ? process.env.STRIPE_PRICE_PRO_EARLY          // $297
        : process.env.STRIPE_PRICE_PRO_FULL,          // $997
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,    // $149/mo
    },
  };

  const prices = PRICE_IDS[plan];
  if (!prices) return res.status(400).json({ error: 'Invalid plan' });

  try {
    let sessionUrl;

    if (!prices.monthly) {
      // Essentials — one-time payment only
      sessionUrl = await createSession({
        mode:         'payment',
        email,
        success_url:  `${domain}/welcome?plan=${plan}`,
        cancel_url:   `${domain}/#pricing`,
        line_items:   [{ price: prices.setup, quantity: 1 }],
        metadata:     { plan, email, company: company||'', name: name||'', website: website||'', is_early: early ? '1' : '0' },
      });
    } else {
      // Growth / Pro — setup fee (one-time) + monthly subscription
      // We use subscription mode and add the setup fee as a one-time add-on
      sessionUrl = await createSession({
        mode:         'subscription',
        email,
        success_url:  `${domain}/welcome?plan=${plan}`,
        cancel_url:   `${domain}/#pricing`,
        line_items:   [
          { price: prices.monthly, quantity: 1 },          // recurring
        ],
        subscription_data: {
          add_invoice_items: [
            { price: prices.setup, quantity: 1 }           // one-time setup fee on first invoice
          ],
          metadata: { plan, is_early: early ? '1' : '0' },
        },
        metadata: { plan, email, company: company||'', name: name||'', website: website||'', is_early: early ? '1' : '0' },
      });
    }

    return res.status(200).json({ url: sessionUrl });

  } catch (err) {
    console.error('[checkout]', err);
    return res.status(500).json({ error: err.message || 'Checkout failed' });
  }
}

async function createSession(params) {
  const body = {};

  body.mode           = params.mode;
  body.customer_email = params.email;
  body.success_url    = params.success_url;
  body.cancel_url     = params.cancel_url;

  // Line items
  params.line_items.forEach((item, i) => {
    body[`line_items[${i}][price]`]    = item.price;
    body[`line_items[${i}][quantity]`] = item.quantity;
  });

  // Metadata
  if (params.metadata) {
    Object.entries(params.metadata).forEach(([k,v]) => {
      body[`metadata[${k}]`] = v;
    });
  }

  // Subscription data (Growth/Pro)
  if (params.subscription_data) {
    const sd = params.subscription_data;
    if (sd.add_invoice_items) {
      sd.add_invoice_items.forEach((item, i) => {
        body[`subscription_data[add_invoice_items][${i}][price]`]    = item.price;
        body[`subscription_data[add_invoice_items][${i}][quantity]`] = item.quantity;
      });
    }
    if (sd.metadata) {
      Object.entries(sd.metadata).forEach(([k,v]) => {
        body[`subscription_data[metadata][${k}]`] = v;
      });
    }
  }

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });

  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.url;
}
