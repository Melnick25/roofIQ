// api/leads.js — POST /api/leads
// Called by the widget when a homeowner submits contact info

import { supabaseAdmin } from '../lib/supabase.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') return res.status(200).setHeaders(CORS).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'Method not allowed' });

  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));

  try {
    const {
      api_key, name, email, phone,
      zip_code, size_id, pitch_id, quality_id,
      squares, est_low, est_mid, est_high,
      shingle_type, monthly_payment,
      roof_age, stories, insurance_flag,
    } = req.body;

    if (!api_key) return res.status(400).json({ error: 'Missing api_key' });
    if (!name && !email && !phone) return res.status(400).json({ error: 'Contact info required' });

    // 1. Look up the roofing company
    const { data: companies, error: cErr } = await supabaseAdmin
      .from('roofing_companies')
      .select('*')
      .eq('api_key', api_key)
      .limit(1);

    if (cErr || !companies?.length)
      return res.status(404).json({ error: 'Invalid widget key' });

    const company = companies[0];

    // 2. Score the lead
    let score = 'warm';
    if (insurance_flag) score = 'hot';
    else if (roof_age === '20+ yrs') score = 'hot';
    else if (roof_age === '10–20 yrs') score = 'warm';
    else if (roof_age === 'Under 10 yrs') score = 'cold';

    // 3. Regional lookup for city/state
    let city = '', state = '';
    if (zip_code) {
      const { data: region } = await supabaseAdmin
        .from('regional_pricing')
        .select('city,state')
        .eq('zip_code', zip_code)
        .limit(1)
        .single();
      if (region) { city = region.city; state = region.state; }
    }

    // 4. Insert the lead
    const { data: lead, error: lErr } = await supabaseAdmin
      .from('leads')
      .insert({
        roofing_company_id: company.id,
        api_key,
        name, email, phone,
        zip_code, city, state,
        size_id, pitch_id, quality_id,
        squares, est_low, est_mid, est_high,
        shingle_type, monthly_payment,
        roof_age, stories,
        insurance_flag: !!insurance_flag,
        score,
        status: 'new',
      })
      .select()
      .single();

    if (lErr) throw lErr;

    // 5. Mark estimate_log as converted
    await supabaseAdmin
      .from('estimate_log')
      .update({ converted: true })
      .eq('api_key', api_key)
      .eq('zip_code', zip_code)
      .eq('converted', false)
      .order('created_at', { ascending: false })
      .limit(1);

    // 6. Send SMS to contractor (Growth + Pro only)
    if (company.plan === 'growth' || company.plan === 'pro') {
      if (company.phone) {
        await sendSMS(company.phone, buildSMS(lead, company));
      }
    }

    // 7. Send email alert to contractor (Essentials+)
    if (['essentials','growth','pro'].includes(company.plan)) {
      if (company.email) {
        await sendEmail({
          to:      company.email,
          subject: `🔔 New RoofIQ Lead — ${name || phone || email} · ~$${Math.round(est_mid).toLocaleString()}`,
          html:    buildLeadEmail(lead, company),
        });
      }
    }

    // 8. Send PDF estimate to homeowner
    if (email && ['essentials','growth','pro'].includes(company.plan)) {
      await sendEmail({
        to:      email,
        subject: `Your Roof Estimate from ${company.company_name}`,
        html:    buildHomeownerEmail(lead, company),
      });
    }

    return res.status(200).json({ ok: true, lead_id: lead.id, score });

  } catch (err) {
    console.error('[leads]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

/* ── SMS ── */
function buildSMS(lead, company) {
  const badge = lead.score === 'hot' ? '🔥' : lead.insurance_flag ? '🛡' : '📲';
  const name  = lead.name || lead.phone || lead.email || 'Homeowner';
  const val   = lead.est_mid ? `~$${Math.round(lead.est_mid).toLocaleString()}` : '';
  const loc   = lead.city ? `${lead.city}, ${lead.state}` : `ZIP ${lead.zip_code}`;
  const ins   = lead.insurance_flag ? ' · Insurance flagged' : '';
  const age   = lead.roof_age ? ` · Roof ${lead.roof_age}` : '';
  const contact = lead.phone || lead.email || '';
  return `${badge} New RoofIQ Lead\n${name} · ${loc} · ${val}${ins}${age}\nContact: ${contact}\nRoofIQ Dashboard → https://roofiq.io/dashboard`;
}

async function sendSMS(to, body) {
  if (!process.env.TWILIO_SID) return;
  const url = `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_SID}/Messages.json`;
  const auth = Buffer.from(`${process.env.TWILIO_SID}:${process.env.TWILIO_TOKEN}`).toString('base64');
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: body }),
  });
}

/* ── Email ── */
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
      from: { email: 'leads@roofiq.io', name: 'RoofIQ' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  });
}

function buildLeadEmail(lead, company) {
  const score = lead.score === 'hot' ? '🔥 Hot Lead' : lead.insurance_flag ? '🛡 Insurance Lead' : '📋 New Lead';
  const val   = lead.est_mid ? `$${Math.round(lead.est_low).toLocaleString()} – $${Math.round(lead.est_high).toLocaleString()}` : 'N/A';
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#c84b11;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h2 style="color:#fff;margin:0;font-size:20px;">RoofIQ — ${score}</h2>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#718096;font-size:13px;width:140px;">Name</td><td style="padding:8px 0;font-weight:600;">${lead.name || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Phone</td><td style="padding:8px 0;font-weight:600;">${lead.phone || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Email</td><td style="padding:8px 0;font-weight:600;">${lead.email || '—'}</td></tr>
        <tr><td colspan="2"><hr style="border:none;border-top:1px solid #e2e8f0;margin:8px 0;"></td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Location</td><td style="padding:8px 0;">${lead.city || ''} ${lead.state || ''} · ZIP ${lead.zip_code}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Estimate</td><td style="padding:8px 0;font-weight:700;color:#c84b11;font-size:18px;">${val}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Quality</td><td style="padding:8px 0;">${lead.quality_id || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Roof age</td><td style="padding:8px 0;">${lead.roof_age || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#718096;font-size:13px;">Insurance</td><td style="padding:8px 0;">${lead.insurance_flag ? '⚠️ Yes — storm damage flagged' : 'No'}</td></tr>
      </table>
      <div style="margin-top:20px;">
        <a href="https://roofiq.io/dashboard" style="background:#c84b11;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">View in Dashboard →</a>
      </div>
      <p style="font-size:11px;color:#a0aec0;margin-top:20px;">Sent by RoofIQ · roofiq.io</p>
    </div>
  </div>`;
}

function buildHomeownerEmail(lead, company) {
  const val = lead.est_mid
    ? `$${Math.round(lead.est_low).toLocaleString()} – $${Math.round(lead.est_high).toLocaleString()}`
    : 'N/A';
  const mo = lead.monthly_payment ? `~$${Math.round(lead.monthly_payment).toLocaleString()}/mo` : '';
  return `
  <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#1b2b4b;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h2 style="color:#fff;margin:0;font-size:20px;">${company.company_name}</h2>
      <p style="color:rgba(255,255,255,.6);margin:4px 0 0;font-size:13px;">Your Roof Estimate</p>
    </div>
    <div style="background:#fff;padding:24px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
      <p style="color:#4a5568;">Hi ${lead.name || 'there'},</p>
      <p style="color:#4a5568;">Here's your instant roof estimate based on your home details:</p>
      <div style="background:#f7f6f3;border-radius:10px;padding:20px;margin:20px 0;text-align:center;">
        <div style="font-size:12px;color:#718096;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Estimated project cost</div>
        <div style="font-size:36px;font-weight:700;color:#c84b11;">${val}</div>
        <div style="font-size:13px;color:#718096;margin-top:4px;">Includes labor, materials, dumpster &amp; permit</div>
        ${mo ? `<div style="font-size:13px;color:#4a5568;margin-top:8px;">Financing available from <strong>${mo}</strong></div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <tr><td style="padding:6px 0;color:#718096;width:140px;">Location</td><td>ZIP ${lead.zip_code}</td></tr>
        <tr><td style="padding:6px 0;color:#718096;">Quality</td><td>${lead.shingle_type || lead.quality_id}</td></tr>
        <tr><td style="padding:6px 0;color:#718096;">Approx. size</td><td>${lead.squares} squares</td></tr>
      </table>
      <p style="color:#4a5568;margin-top:20px;">We'll reach out within 1 business day to discuss next steps. No obligation.</p>
      <p style="font-size:12px;color:#a0aec0;margin-top:24px;">This estimate is based on the details you provided and current market rates. Final pricing may vary based on a site inspection. Sent by ${company.company_name} via RoofIQ.</p>
    </div>
  </div>`;
}
