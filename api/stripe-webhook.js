// api/stripe-webhook.js — POST /api/stripe-webhook
// Stripe calls this automatically when payment events happen
// Set this URL in your Stripe dashboard → Webhooks

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig  = req.headers['stripe-signature'];
  const body = await getRawBody(req);

  let event;
  try {
    event = verifyStripeWebhook(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] signature failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const { supabaseAdmin } = await import('../lib/supabase.js');

  try {
    switch (event.type) {

      // ── One-time payment succeeded (Essentials $297 setup fee) ──
      case 'checkout.session.completed': {
        const session  = event.data.object;
        const meta     = session.metadata || {};
        const email    = session.customer_email || meta.email;
        const plan     = meta.plan || 'essentials';
        const name     = meta.name || '';
        const company  = meta.company || '';
        const website  = meta.website || '';
        const stripeId = session.customer;
        const subId    = session.subscription || null;

        // Check if account exists (trial → paid upgrade)
        const { data: existing } = await supabaseAdmin
          .from('roofing_companies')
          .select('*')
          .eq('email', email.toLowerCase())
          .limit(1);

        let company_row;

        if (existing?.length) {
          // Upgrade existing trial
          const { data } = await supabaseAdmin
            .from('roofing_companies')
            .update({
              plan,
              stripe_customer_id:     stripeId,
              stripe_subscription_id: subId,
              sms_alerts: ['growth','pro'].includes(plan),
            })
            .eq('email', email.toLowerCase())
            .select()
            .single();
          company_row = data;
        } else {
          // New customer — create account
          const { data } = await supabaseAdmin
            .from('roofing_companies')
            .insert({
              company_name:           company,
              email:                  email.toLowerCase(),
              plan,
              stripe_customer_id:     stripeId,
              stripe_subscription_id: subId,
              email_alerts:           true,
              sms_alerts:             ['growth','pro'].includes(plan),
              primary_color:          '#c84b11',
              tagline:                'Free Instant Roof Estimate',
            })
            .select()
            .single();
          company_row = data;
        }

        // Send welcome/upgrade email
        await sendWelcomeEmail(company_row, name, plan);

        // Alert owner
        await sendOwnerAlert(company_row, name, plan, 'NEW PAYING CLIENT');
        break;
      }

      // ── Subscription renewed ──
      case 'invoice.paid': {
        const invoice  = event.data.object;
        const stripeId = invoice.customer;
        if (invoice.billing_reason === 'subscription_create') break; // handled above

        await supabaseAdmin
          .from('roofing_companies')
          .update({ plan_started_at: new Date().toISOString() })
          .eq('stripe_customer_id', stripeId);
        break;
      }

      // ── Subscription cancelled or payment failed ──
      case 'customer.subscription.deleted':
      case 'invoice.payment_failed': {
        const obj      = event.data.object;
        const stripeId = obj.customer;

        // Downgrade to essentials (they keep the widget, lose monthly features)
        await supabaseAdmin
          .from('roofing_companies')
          .update({ plan: 'essentials', sms_alerts: false })
          .eq('stripe_customer_id', stripeId);

        // Get their email to notify them
        const { data: co } = await supabaseAdmin
          .from('roofing_companies')
          .select('email, company_name')
          .eq('stripe_customer_id', stripeId)
          .single();

        if (co) {
          await sendEmail({
            to:      co.email,
            subject: 'Your RoofIQ subscription — action needed',
            html:    cancellationEmail(co.company_name, event.type),
          });
        }
        break;
      }

      // ── Subscription upgraded/changed ──
      case 'customer.subscription.updated': {
        const sub      = event.data.object;
        const stripeId = sub.customer;
        const priceId  = sub.items?.data?.[0]?.price?.id;
        const plan     = planFromPriceId(priceId);

        if (plan) {
          await supabaseAdmin
            .from('roofing_companies')
            .update({ plan, sms_alerts: ['growth','pro'].includes(plan) })
            .eq('stripe_customer_id', stripeId);
        }
        break;
      }
    }

    return res.status(200).json({ received: true });

  } catch (err) {
    console.error('[stripe-webhook]', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
}

/* ── Stripe signature verification (no SDK needed) ── */
function verifyStripeWebhook(payload, sig, secret) {
  const crypto = require('crypto');
  const parts  = sig.split(',').reduce((acc, part) => {
    const [k,v] = part.split('=');
    acc[k] = v;
    return acc;
  }, {});
  const timestamp = parts.t;
  const expected  = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`)
    .digest('hex');
  if (expected !== parts.v1) throw new Error('Signature mismatch');
  if (Math.abs(Date.now()/1000 - parseInt(timestamp)) > 300) throw new Error('Timestamp too old');
  return JSON.parse(payload);
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/* ── Price ID → plan name mapping ──
   Replace these with your actual Stripe Price IDs after creating products */
function planFromPriceId(priceId) {
  const map = {
    [process.env.STRIPE_PRICE_GROWTH]: 'growth',
    [process.env.STRIPE_PRICE_PRO]:    'pro',
  };
  return map[priceId] || null;
}

/* ── Emails ── */
async function sendEmail({ to, subject, html }) {
  if (!process.env.SENDGRID_API_KEY) return;
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: 'growth@ardeablue.io', name: 'RoofIQ' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}

async function sendWelcomeEmail(company, name, plan) {
  const domain    = 'https://roofiq.live';
  const planNames = { essentials:'Essentials', growth:'Growth', pro:'Pro' };
  const features  = {
    essentials: ['Your logo & brand colors', 'Unlimited estimates', 'Lead capture', 'Email alerts on every lead', 'PDF estimate to homeowner'],
    growth:     ['Everything in Essentials', 'SMS alerts to your phone', 'Appointment booking', 'Lead scoring', 'Leads dashboard'],
    pro:        ['Everything in Growth', 'AI follow-up sequences', 'NOAA storm verification', 'Multi-location support'],
  };
  const embedCode = `&lt;script src="${domain}/widget.js" data-key="${company.api_key}"&gt;&lt;/script&gt;`;

  await sendEmail({
    to:      company.email,
    subject: `You're live on RoofIQ ${planNames[plan]} — here's your setup`,
    html: `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
      <div style="background:#c84b11;padding:24px;border-radius:12px 12px 0 0;">
        <h1 style="color:#fff;font-size:22px;margin:0;">RoofIQ ${planNames[plan]} is active ✓</h1>
      </div>
      <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
        <p style="color:#4a5568;">Hi ${name.split(' ')[0]}, your account is ready. Here's everything you need:</p>

        <h3 style="color:#1b2b4b;margin-top:20px;">Your embed code</h3>
        <div style="background:#f7f6f3;border-radius:8px;padding:14px;font-family:monospace;font-size:12px;color:#c84b11;word-break:break-all;">${embedCode}</div>
        <p style="color:#718096;font-size:13px;">Paste this before &lt;/body&gt; on any page of your site.</p>

        <h3 style="color:#1b2b4b;margin-top:20px;">Your dashboard</h3>
        <p style="color:#4a5568;font-size:14px;">
          URL: <a href="${domain}/dashboard" style="color:#c84b11;">${domain}/dashboard</a><br>
          Login key: <code style="background:#f7f6f3;padding:2px 6px;border-radius:4px;">${company.api_key}</code>
        </p>

        <h3 style="color:#1b2b4b;margin-top:20px;">What's included</h3>
        <ul style="color:#4a5568;font-size:14px;line-height:1.8;">
          ${(features[plan]||[]).map(f=>`<li>${f}</li>`).join('')}
        </ul>

        <div style="margin-top:24px;text-align:center;">
          <a href="${domain}/dashboard" style="background:#c84b11;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">Open My Dashboard →</a>
        </div>

        <div style="margin-top:24px;background:#f0fdf8;border:1px solid #b2dfcc;border-radius:10px;padding:16px;">
          <p style="color:#276749;font-size:14px;margin:0;"><strong>Free setup call included.</strong> Reply to this email and we'll install the widget on your site and customize your branding on a quick call.</p>
        </div>

        <p style="color:#a0aec0;font-size:12px;margin-top:20px;">RoofIQ · growth@ardeablue.io</p>
      </div>
    </div>`,
  });
}

async function sendOwnerAlert(company, name, plan, type) {
  await sendEmail({
    to:      'growth@ardeablue.io',
    subject: `💰 ${type} — ${company.company_name} · ${plan}`,
    html: `
    <div style="font-family:sans-serif;max-width:480px;">
      <div style="background:#276749;padding:16px;border-radius:10px 10px 0 0;">
        <h2 style="color:#fff;margin:0;">💰 ${type}</h2>
      </div>
      <div style="background:#fff;padding:20px;border:1px solid #e2e8f0;border-radius:0 0 10px 10px;font-size:14px;">
        <p><strong>Company:</strong> ${company.company_name}</p>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${company.email}</p>
        <p><strong>Plan:</strong> <span style="color:#c84b11;font-weight:700;">${plan}</span></p>
        <p><strong>API Key:</strong> <code>${company.api_key}</code></p>
      </div>
    </div>`,
  });
}

function cancellationEmail(companyName, eventType) {
  const isFailed = eventType === 'invoice.payment_failed';
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#1b2b4b;padding:20px;border-radius:10px 10px 0 0;">
      <h2 style="color:#fff;margin:0;font-size:18px;">${isFailed ? 'Payment failed — action needed' : 'Your subscription has ended'}</h2>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 10px 10px;">
      <p style="color:#4a5568;">Hi ${companyName},</p>
      ${isFailed
        ? `<p style="color:#4a5568;">Your RoofIQ payment didn't go through. Your account has been moved to Essentials. Update your payment method to restore Growth/Pro features.</p>`
        : `<p style="color:#4a5568;">Your RoofIQ subscription has ended. Your widget and lead capture are still active on Essentials. Resubscribe anytime to restore your monthly features.</p>`
      }
      <div style="margin-top:20px;text-align:center;">
        <a href="https://roofiq.live/#pricing" style="background:#c84b11;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;">Reactivate →</a>
      </div>
      <p style="color:#a0aec0;font-size:12px;margin-top:20px;">Questions? Reply to this email.</p>
    </div>
  </div>`;
}
