// api/config.js — GET /api/config?key=API_KEY
// Widget calls this on load to get branding + plan info

import { supabaseAdmin } from '../lib/supabase.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).setHeaders(CORS).end();
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  try {
    const { data: companies } = await supabaseAdmin
      .from('roofing_companies')
      .select('id,company_name,logo_url,primary_color,tagline,plan,trial_uses_left,trial_started,availability')
      .eq('api_key', key)
      .limit(1);

    if (!companies?.length) return res.status(404).json({ error: 'Invalid key' });
    const c = companies[0];

    // Check trial limits
    if (c.plan === 'starter') {
      const daysSince = (Date.now() - new Date(c.trial_started).getTime()) / 86400000;
      if (daysSince >= 14 || c.trial_uses_left <= 0) {
        return res.status(200).json({
          company_name:   c.company_name,
          plan:           c.plan,
          trial_expired:  true,
          upgrade_url:    'https://roofiq.io/#pricing',
        });
      }
    }

    return res.status(200).json({
      company_id:     c.id,
      company_name:   c.company_name,
      logo_url:       c.logo_url,
      primary_color:  c.primary_color || '#c84b11',
      tagline:        c.tagline || 'Free Instant Roof Estimate',
      plan:           c.plan,
      trial_uses_left: c.trial_uses_left,
      booking_enabled: ['growth','pro'].includes(c.plan),
      sms_enabled:     ['growth','pro'].includes(c.plan),
      trial_expired:  false,
    });

  } catch (err) {
    console.error('[config]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
