// api/admin.js — GET/POST/PATCH /api/admin
// Password-protected admin API for managing clients

import { supabaseAdmin } from '../lib/supabase.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).setHeaders(CORS).end();
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));

  // Password check
  const pass = req.query.pass;
  if (pass !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {

    // GET — fetch all companies with lead counts
    if (req.method === 'GET') {
      const { data: companies } = await supabaseAdmin
        .from('roofing_companies')
        .select('*')
        .order('created_at', { ascending: false });

      // Get lead counts per company
      const { data: leadCounts } = await supabaseAdmin
        .from('leads')
        .select('roofing_company_id')
        .not('roofing_company_id', 'is', null);

      const countMap = {};
      (leadCounts||[]).forEach(l => {
        countMap[l.roofing_company_id] = (countMap[l.roofing_company_id]||0) + 1;
      });

      const enriched = (companies||[]).map(c => ({
        ...c,
        lead_count: countMap[c.id] || 0,
        api_key_display: c.api_key,
      }));

      return res.status(200).json({ companies: enriched });
    }

    // POST — create new client manually
    if (req.method === 'POST') {
      const { company_name, email, phone, plan, primary_color, logo_url, tagline } = req.body;

      if (!company_name || !email) {
        return res.status(400).json({ error: 'Company name and email required' });
      }

      const { data: company, error } = await supabaseAdmin
        .from('roofing_companies')
        .insert({
          company_name,
          email: email.toLowerCase(),
          phone: phone || null,
          plan:  plan || 'starter',
          primary_color: primary_color || '#c84b11',
          logo_url:      logo_url || null,
          tagline:       tagline || 'Free Instant Roof Estimate',
          email_alerts:  true,
          sms_alerts:    ['growth','pro'].includes(plan),
          trial_uses_left: plan === 'starter' ? 25 : 999,
        })
        .select()
        .single();

      if (error) throw error;

      // Send welcome email
      if (email) {
        await sendWelcomeEmail(company);
      }

      return res.status(200).json({ ok: true, company });
    }

    // PATCH — update existing client
    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: 'Missing id' });

      const { company_name, email, phone, plan, primary_color, logo_url, tagline } = req.body;

      const { data: updated, error } = await supabaseAdmin
        .from('roofing_companies')
        .update({
          company_name,
          email:         email?.toLowerCase(),
          phone:         phone || null,
          plan,
          primary_color: primary_color || '#c84b11',
          logo_url:      logo_url || null,
          tagline:       tagline || 'Free Instant Roof Estimate',
          sms_alerts:    ['growth','pro'].includes(plan),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ ok: true, company: updated });
    }

  } catch (err) {
    console.error('[admin]', err);
    return res.status(500).json({ error: err.message });
  }
}

async function sendWelcomeEmail(company) {
  if (!process.env.SENDGRID_API_KEY) return;
  const domain     = 'https://roofiq.live';
  const embedCode  = `<script src="${domain}/widget.js" data-key="${company.api_key}"></script>`;

  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${process.env.SENDGRID_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: company.email }] }],
      from: { email: 'growth@ardeablue.io', name: 'RoofIQ' },
      subject: `Welcome to RoofIQ — your estimator is ready`,
      content: [{
        type: 'text/html',
        value: `
        <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
          <div style="background:#1b2b4b;padding:22px 24px;border-radius:12px 12px 0 0;">
            <h1 style="color:#fff;font-size:21px;margin:0;">Welcome to RoofIQ!</h1>
          </div>
          <div style="background:#fff;padding:26px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
            <p style="color:#4a5568;">Your RoofIQ account for <strong>${company.company_name}</strong> is ready.</p>
            <h3 style="color:#1b2b4b;margin-top:18px;">Add this to your website</h3>
            <div style="background:#f7f6f3;border-radius:8px;padding:13px;font-family:monospace;font-size:12px;color:#c84b11;word-break:break-all;">${embedCode.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
            <h3 style="color:#1b2b4b;margin-top:18px;">Your dashboard</h3>
            <p style="color:#4a5568;font-size:14px;">
              <a href="${domain}/dashboard" style="color:#c84b11;">${domain}/dashboard</a><br>
              Login: <code style="background:#f7f6f3;padding:2px 6px;border-radius:4px;font-size:12px;">${company.api_key}</code>
            </p>
            <div style="margin-top:22px;text-align:center;">
              <a href="${domain}/dashboard" style="background:#c84b11;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block;">Open Dashboard →</a>
            </div>
            <p style="color:#a0aec0;font-size:12px;margin-top:20px;">Reply to this email for setup help — we'll get you live on a quick call.</p>
          </div>
        </div>`,
      }],
    }),
  });
}
