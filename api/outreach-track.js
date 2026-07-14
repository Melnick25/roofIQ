import { supabaseAdmin } from '../lib/supabase.js';

const PIXEL = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64'
);

function safeEventType(value) {
  const t = String(value || '').toLowerCase();
  return ['open', 'click', 'reply', 'booked_demo', 'sent'].includes(t) ? t : 'click';
}

function safeRedirect(value) {
  try {
    const url = new URL(value || 'https://www.roofiq.live/');
    if (!['http:', 'https:'].includes(url.protocol)) return 'https://www.roofiq.live/';
    return url.toString();
  } catch (_) {
    return 'https://www.roofiq.live/';
  }
}

async function recordEvent({ type, hash, email, detail, req }) {
  if (!hash) return;
  const now = new Date().toISOString();
  const update = {};
  if (type === 'open') update.opened_at = now;
  if (type === 'click') update.clicked_at = now;
  if (type === 'reply') update.replied_at = now;
  if (type === 'booked_demo') update.booked_demo_at = now;
  if (Object.keys(update).length) {
    update.sequence_status = type === 'booked_demo' ? 'booked_demo' : 'engaged';
    await supabaseAdmin
      .from('roofiq_prospect_companies')
      .update(update)
      .eq('source_row_hash', hash);
  }

  const { data: prospect } = await supabaseAdmin
    .from('roofiq_prospect_companies')
    .select('id')
    .eq('source_row_hash', hash)
    .limit(1)
    .maybeSingle();

  await supabaseAdmin.from('roofiq_outreach_events').insert({
    prospect_id: prospect?.id || null,
    source_row_hash: hash,
    event_type: type,
    event_detail: detail || '',
    metadata: {
      email: email || '',
      user_agent: req.headers['user-agent'] || '',
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
    },
  });
}

export default async function handler(req, res) {
  const type = safeEventType(req.query.t || req.body?.t);
  const hash = String(req.query.h || req.body?.h || '');
  const email = String(req.query.email || req.body?.email || '');
  const redirectUrl = safeRedirect(req.query.url || req.body?.url);

  try {
    await recordEvent({
      type,
      hash,
      email,
      detail: type === 'click' ? redirectUrl : '',
      req,
    });
  } catch (err) {
    console.warn('[outreach-track]', err.message);
  }

  if (type === 'open') {
    res.setHeader('Content-Type', 'image/gif');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    return res.status(200).send(PIXEL);
  }

  if (type === 'click') {
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, redirectUrl);
  }

  return res.status(200).json({ ok: true });
}
