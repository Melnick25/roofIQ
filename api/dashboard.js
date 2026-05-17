// api/dashboard.js — GET /api/dashboard?key=API_KEY
// Returns all leads + pipeline stats for the contractor's dashboard

import { supabaseAdmin } from '../lib/supabase.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).setHeaders(CORS).end();
  Object.entries(CORS).forEach(([k,v]) => res.setHeader(k, v));

  const { key } = req.query;
  if (!key) return res.status(400).json({ error: 'Missing key' });

  try {
    // Auth
    const { data: companies } = await supabaseAdmin
      .from('roofing_companies')
      .select('*')
      .eq('api_key', key)
      .limit(1);

    if (!companies?.length) return res.status(404).json({ error: 'Invalid key' });
    const company = companies[0];

    if (req.method === 'PATCH') {
      // Update lead status
      const { lead_id, status } = req.body;
      await supabaseAdmin
        .from('leads')
        .update({ status })
        .eq('id', lead_id)
        .eq('roofing_company_id', company.id);
      return res.status(200).json({ ok: true });
    }

    // GET — fetch leads + stats
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();

    const { data: leads } = await supabaseAdmin
      .from('leads')
      .select('*')
      .eq('roofing_company_id', company.id)
      .order('created_at', { ascending: false })
      .limit(100);

    const { data: estimateLog } = await supabaseAdmin
      .from('estimate_log')
      .select('id,converted,created_at')
      .eq('roofing_company_id', company.id)
      .gte('created_at', thirtyDaysAgo);

    // Compute stats
    const monthLeads     = (leads || []).filter(l => l.created_at >= thirtyDaysAgo);
    const pipeline       = monthLeads.reduce((s, l) => s + (l.est_mid || 0), 0);
    const totalEstimates = (estimateLog || []).length;
    const converted      = (estimateLog || []).filter(e => e.converted).length;
    const unconverted    = totalEstimates - converted;
    const unconvertedVal = unconverted * 14000; // rough avg estimate

    return res.status(200).json({
      company: {
        name:  company.company_name,
        plan:  company.plan,
        email: company.email,
        phone: company.phone,
      },
      stats: {
        leads_this_month:  monthLeads.length,
        pipeline_this_month: pipeline,
        estimates_this_month: totalEstimates,
        unconverted,
        unconverted_est_value: unconvertedVal,
      },
      leads: leads || [],
    });

  } catch (err) {
    console.error('[dashboard]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
