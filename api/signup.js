// api/signup.js — POST /api/signup
// Handles free trial signups — instant account creation, welcome email, admin alert

import { supabaseAdmin } from '../lib/supabase.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).setHeaders(CORS).end();
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { name, company, email, phone, website, plan } = req.body;

    if (!name || !email || !company)
      return res.status(400).json({ error: 'Name, company and email are required' });

    // Check if already exists
    const { data: existing } = await supabaseAdmin
      .from('roofing_companies')
      .select('id, api_key, plan')
      .eq('email', email.toLowerCase())
      .limit(1);

    if (existing?.length) {
      return res.status(200).json({
        ok: true,
        already_exists: true,
        message: 'Account already exists — check your email for your API key.',
      });
    }

    // Create the account
    const { data: company_row, error } = await supabaseAdmin
      .from('roofing_companies')
      .insert({
        company_name:   company,
        email:          email.toLowerCase(),
        phone:          phone || null,
        plan:           plan || 'starter',
        trial_uses_left: 25,
        trial_started:  new Date().toISOString(),
        email_alerts:   true,
        sms_alerts:     false,
        tagline:        'Free Instant Roof Estimate',
        primary_color:  '#c84b11',
      })
      .select()
      .single();

    if (error) throw error;

    // Send welcome email to contractor
    await sendEmail({
      to:      email,
      subject: `Welcome to RoofIQ — your estimator is ready to install`,
      html:    welcomeEmail(company_row, name, website),
    });

    // Alert you (the owner)
    await sendEmail({
      to:      'growth@ardeablue.io',
      subject: `🎉 New RoofIQ signup — ${company} (${plan || 'starter'})`,
      html:    adminAlert(company_row, name, website),
    });

    // Schedule follow-up emails (logged to DB, processed by /api/followup cron)
    await supabaseAdmin.from('email_queue').insert([
      {
        roofing_company_id: company_row.id,
        send_after: daysFromNow(7),
        template: 'trial_day7',
        email: email.toLowerCase(),
        company_name: company,
      },
      {
        roofing_company_id: company_row.id,
        send_after: daysFromNow(10),
        template: 'trial_day10',
        email: email.toLowerCase(),
        company_name: company,
      },
      {
        roofing_company_id: company_row.id,
        send_after: daysFromNow(13),
        template: 'trial_day13',
        email: email.toLowerCase(),
        company_name: company,
      },
    ]).catch(() => {}); // non-fatal if email_queue doesn't exist yet

    return res.status(200).json({
      ok:      true,
      api_key: company_row.api_key,
      plan:    company_row.plan,
      message: 'Account created — check your email.',
    });

  } catch (err) {
    console.error('[signup]', err);
    return res.status(500).json({ error: 'Could not create account. Please try again.' });
  }
}

function daysFromNow(n) {
  return new Date(Date.now() + n * 86400000).toISOString();
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('[email skipped — no SENDGRID_API_KEY]', to, subject);
    return;
  }
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

function welcomeEmail(company, name, website) {
  const domain = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://roofiq.live';
  const embedCode = `&lt;script src="${domain}/widget.js" data-key="${company.api_key}"&gt;&lt;/script&gt;`;
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
    <div style="background:#1b2b4b;padding:24px;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;font-size:24px;margin:0;">Welcome to RoofIQ, ${name.split(' ')[0]}! 🎉</h1>
    </div>
    <div style="background:#fff;padding:28px;border:1px solid #e2e8f0;border-radius:0 0 12px 12px;">
      <p style="color:#4a5568;font-size:15px;">Your free trial is active — 25 estimates, 14 days. Here's how to get your estimator live in the next 5 minutes.</p>

      <h3 style="color:#1b2b4b;margin-top:24px;">Step 1 — Paste this code on your website</h3>
      <p style="color:#4a5568;font-size:14px;">Add this before the &lt;/body&gt; tag on any page:</p>
      <div style="background:#f7f6f3;border:1px solid #e2e8f0;border-radius:8px;padding:14px;font-family:monospace;font-size:13px;color:#c84b11;word-break:break-all;">
        ${embedCode}
      </div>

      <h3 style="color:#1b2b4b;margin-top:24px;">Step 2 — View your leads dashboard</h3>
      <p style="color:#4a5568;font-size:14px;">Your API key is also your dashboard login:</p>
      <div style="background:#f7f6f3;border:1px solid #e2e8f0;border-radius:8px;padding:14px;font-family:monospace;font-size:13px;color:#1b2b4b;">
        Dashboard: <a href="${domain}/dashboard" style="color:#c84b11;">${domain}/dashboard</a><br>
        API Key: ${company.api_key}
      </div>

      <div style="margin-top:28px;text-align:center;">
        <a href="${domain}/dashboard" style="background:#c84b11;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:16px;display:inline-block;">View My Dashboard →</a>
      </div>

      <div style="margin-top:28px;background:#f0fdf8;border:1px solid #b2dfcc;border-radius:10px;padding:16px;">
        <p style="color:#276749;font-size:14px;margin:0;"><strong>Need help installing?</strong> Reply to this email and we'll set it up for you on a quick call — included with your trial.</p>
      </div>

      <p style="color:#a0aec0;font-size:12px;margin-top:24px;">RoofIQ · Built by Ardeablue · <a href="mailto:growth@ardeablue.io" style="color:#a0aec0;">growth@ardeablue.io</a></p>
    </div>
  </div>`;
}

function adminAlert(company, name, website) {
  return `
  <div style="font-family:sans-serif;max-width:500px;">
    <div style="background:#276749;padding:16px 20px;border-radius:10px 10px 0 0;">
      <h2 style="color:#fff;margin:0;font-size:18px;">🎉 New RoofIQ Signup</h2>
    </div>
    <div style="background:#fff;padding:20px;border:1px solid #e2e8f0;border-radius:0 0 10px 10px;">
      <table style="width:100%;font-size:14px;">
        <tr><td style="color:#718096;padding:6px 0;width:120px;">Name</td><td style="font-weight:600;">${name}</td></tr>
        <tr><td style="color:#718096;padding:6px 0;">Company</td><td style="font-weight:600;">${company.company_name}</td></tr>
        <tr><td style="color:#718096;padding:6px 0;">Email</td><td>${company.email}</td></tr>
        <tr><td style="color:#718096;padding:6px 0;">Website</td><td>${website || '—'}</td></tr>
        <tr><td style="color:#718096;padding:6px 0;">Plan</td><td style="font-weight:700;color:#c84b11;">${company.plan}</td></tr>
        <tr><td style="color:#718096;padding:6px 0;">API Key</td><td style="font-family:monospace;font-size:12px;">${company.api_key}</td></tr>
      </table>
    </div>
  </div>`;
}
