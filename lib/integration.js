export const ROOFIQ_PRODUCT = 'RoofIQ';

export function trialEndFrom(start, days = 14) {
  const base = start ? new Date(start) : new Date();
  return new Date(base.getTime() + days * 86400000).toISOString();
}

export function subscriptionStatusForPlan(plan) {
  if (plan === 'starter') return 'trialing';
  if (['essentials', 'growth'].includes(plan)) return 'active';
  if (plan === 'pro') return 'waitlist';
  return 'unknown';
}

export function trialStatusForCompany(company) {
  const plan = company?.plan || 'starter';
  if (plan !== 'starter') return 'converted';
  const start = company.trial_start || company.trial_started || company.created_at || new Date().toISOString();
  const end = company.trial_end || trialEndFrom(start);
  const usesLeft = Number(company.trial_uses_left ?? 0);
  return new Date(end).getTime() <= Date.now() || usesLeft <= 0 ? 'expired' : 'active';
}

export function websiteFromRequest(req, fallback = '') {
  const explicit = req.query?.website_url || req.body?.website_url || req.body?.website || '';
  const referer = req.headers?.referer || req.headers?.origin || '';
  return normalizeWebsiteUrl(explicit || referer || fallback);
}

export function normalizeWebsiteUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    return `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`;
  } catch (_) {
    return raw.slice(0, 250);
  }
}

export function integrationCreateFields({ contractor_id, website, plan = 'starter' } = {}) {
  const trialStart = new Date().toISOString();
  return {
    contractor_id: contractor_id || null,
    product: ROOFIQ_PRODUCT,
    trial_start: trialStart,
    trial_end: trialEndFrom(trialStart),
    trial_status: plan === 'starter' ? 'active' : 'converted',
    subscription_status: subscriptionStatusForPlan(plan),
    website_url: normalizeWebsiteUrl(website),
  };
}

export async function updateCompanyUsage(supabaseAdmin, companyId, fields) {
  const clean = Object.fromEntries(
    Object.entries(fields || {}).filter(([, value]) => value !== undefined)
  );
  if (!companyId || !Object.keys(clean).length) return;
  try {
    const { error } = await supabaseAdmin
      .from('roofing_companies')
      .update(clean)
      .eq('id', companyId);
    if (error) console.warn('[integration] usage update skipped:', error.message);
  } catch (err) {
    console.warn('[integration] usage update skipped:', err.message);
  }
}

export function adminExportRow(company) {
  return {
    contractor_id: company.contractor_id || company.id,
    website_url: company.website_url || company.website || '',
    widget_status: company.widget_installed ? 'installed' : 'not_installed',
    leads_captured: Number(company.lead_count || 0),
    estimate_summaries_generated: Number(company.estimate_summary_count || 0),
    bookings: Number(company.booking_count || 0),
    alert_count: Number(company.alert_count || 0),
    dashboard_last_active_at: company.dashboard_last_active_at || '',
    subscription_status: company.subscription_status || subscriptionStatusForPlan(company.plan),
    trial_status: company.trial_status || trialStatusForCompany(company),
    product: company.product || ROOFIQ_PRODUCT,
  };
}
