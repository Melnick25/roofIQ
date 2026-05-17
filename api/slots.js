// api/slots.js — GET /api/slots?key=API_KEY
// Returns next available inspection slots for a contractor

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
    // Get company + availability config
    const { data: companies } = await supabaseAdmin
      .from('roofing_companies')
      .select('id, availability, plan')
      .eq('api_key', key)
      .limit(1);

    if (!companies?.length) return res.status(404).json({ error: 'Invalid key' });
    const company = companies[0];

    // Only Growth + Pro get booking
    if (!['growth','pro'].includes(company.plan)) {
      return res.status(403).json({ error: 'Booking requires Growth or Pro plan' });
    }

    if (req.method === 'GET') {
      // Return next 10 available pre-generated slots
      const now = new Date().toISOString();
      const { data: slots } = await supabaseAdmin
        .from('booking_slots')
        .select('id, slot_start, slot_end')
        .eq('roofing_company_id', company.id)
        .eq('booked', false)
        .gte('slot_start', now)
        .order('slot_start', { ascending: true })
        .limit(10);

      // If no slots pre-generated, auto-generate from availability config
      const available = slots?.length ? slots : generateSlots(company);

      return res.status(200).json({ slots: available });
    }

    if (req.method === 'POST') {
      // Book a slot
      const { slot_id, slot_start, lead_id } = req.body;

      if (slot_id) {
        // Update existing slot
        await supabaseAdmin
          .from('booking_slots')
          .update({ booked: true, lead_id })
          .eq('id', slot_id)
          .eq('roofing_company_id', company.id);
      } else {
        // Insert new booked slot
        await supabaseAdmin
          .from('booking_slots')
          .insert({
            roofing_company_id: company.id,
            slot_start,
            slot_end: new Date(new Date(slot_start).getTime() + 2*60*60*1000).toISOString(),
            booked: true,
            lead_id,
          });
      }

      // Update lead with booking
      if (lead_id) {
        await supabaseAdmin
          .from('leads')
          .update({ status: 'booked', booked_at: new Date().toISOString(), booking_slot: slot_start })
          .eq('id', lead_id);
      }

      return res.status(200).json({ ok: true });
    }

  } catch (err) {
    console.error('[slots]', err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// Generate slots from contractor's availability config if none pre-exist
function generateSlots(company) {
  const avail = company.availability || [];
  if (!avail.length) {
    // Default: Mon–Fri 9am–4pm, 2hr slots, next 7 days
    return defaultSlots();
  }
  return defaultSlots(); // Expand later when dashboard availability config is live
}

function defaultSlots() {
  const slots = [];
  const now   = new Date();
  for (let d = 1; d <= 10; d++) {
    const date = new Date(now);
    date.setDate(date.getDate() + d);
    const day = date.getDay();
    if (day === 0 || day === 6) continue; // Skip weekends
    const times = ['09:00','11:00','13:00','15:00'];
    for (const t of times) {
      const [h, m] = t.split(':').map(Number);
      const start  = new Date(date);
      start.setHours(h, m, 0, 0);
      const end = new Date(start);
      end.setHours(h + 2, m, 0, 0);
      slots.push({
        id:         null,
        slot_start: start.toISOString(),
        slot_end:   end.toISOString(),
      });
      if (slots.length >= 8) break;
    }
    if (slots.length >= 8) break;
  }
  return slots;
}
