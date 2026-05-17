# RoofIQ — Deployment Guide
## Zero to live on Vercel in under 30 minutes

---

## What's in this project

```
roofiq/
├── public/
│   ├── index.html        ← Pricing/marketing page (your homepage)
│   └── widget.js         ← The embeddable estimator widget
├── dashboard/
│   └── index.html        ← Contractor dashboard (roofiq.io/dashboard)
├── api/
│   ├── config.js         ← Widget config + branding lookup
│   ├── leads.js          ← Lead submission + SMS/email alerts
│   ├── slots.js          ← Booking slot management
│   └── dashboard.js      ← Dashboard data API
├── lib/
│   └── supabase.js       ← Shared DB client
├── supabase-schema.sql   ← Run once to set up all tables
├── vercel.json           ← Routing config
└── package.json
```

---

## Step 1 — Supabase setup (5 min)

1. Go to [supabase.com](https://supabase.com) → New project
2. Name it `roofiq` · Choose a region close to your market
3. Go to **SQL Editor** → paste the entire contents of `supabase-schema.sql` → Run
4. Go to **Settings → API** and copy:
   - `Project URL` → your `SUPABASE_URL`
   - `anon public` key → your `SUPABASE_ANON_KEY`
   - `service_role` key → your `SUPABASE_SERVICE_KEY`

---

## Step 2 — SendGrid (email alerts) (5 min)

1. Go to [sendgrid.com](https://sendgrid.com) → free account
2. Settings → API Keys → Create key (Full Access)
3. Verify a sender email (e.g. `leads@yourdomain.com`)
4. Save your `SENDGRID_API_KEY`

> **Without SendGrid:** email alerts won't send but everything else works.

---

## Step 3 — Twilio (SMS alerts) (5 min)

1. Go to [twilio.com](https://twilio.com) → free trial
2. Get a phone number ($1/mo after trial)
3. From your console copy:
   - `Account SID` → `TWILIO_SID`
   - `Auth Token` → `TWILIO_TOKEN`
   - Your Twilio number → `TWILIO_FROM` (format: +15550001234)

> **Without Twilio:** SMS alerts won't send. Growth/Pro contractors won't get texts.
> You can add this after launch.

---

## Step 4 — Deploy to Vercel (5 min)

### Option A — GitHub (recommended)

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Framework: **Other**
4. Root directory: `/` (the roofiq folder)

### Option B — Vercel CLI

```bash
npm i -g vercel
cd roofiq
vercel
```

### Add environment variables

In Vercel → Project → Settings → Environment Variables, add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon key |
| `SUPABASE_SERVICE_KEY` | Your Supabase service role key |
| `SENDGRID_API_KEY` | Your SendGrid API key |
| `TWILIO_SID` | Your Twilio Account SID |
| `TWILIO_TOKEN` | Your Twilio Auth Token |
| `TWILIO_FROM` | Your Twilio phone number |

Then redeploy: **Vercel → Deployments → Redeploy**

---

## Step 5 — Update your domain in widget.js

Open `public/widget.js` and change line 7:

```js
const BASE_URL = 'https://roofiq.io'; // ← change to your Vercel domain
```

Replace `roofiq.io` with your actual Vercel URL (e.g. `roofiq.vercel.app`)
or your custom domain once it's connected.

---

## Step 6 — Add your first paying client

1. Go to Supabase → Table Editor → `roofing_companies`
2. Click **Insert row** and fill in:

| Field | Value |
|---|---|
| `company_name` | Their company name |
| `email` | Their email (gets lead alerts) |
| `phone` | Their cell (gets SMS alerts) |
| `plan` | `essentials` / `growth` / `pro` |
| `primary_color` | Their brand color (e.g. `#c84b11`) |
| `logo_url` | URL to their logo image |
| `tagline` | Custom tagline or leave default |

3. Copy the auto-generated `api_key` value
4. Send them this embed code:

```html
<script src="https://YOUR-DOMAIN.vercel.app/widget.js"
        data-key="THEIR_API_KEY"></script>
```

They paste this before `</body>` on any page of their site.

---

## Step 7 — Give contractor their dashboard URL

Send them: `https://YOUR-DOMAIN.vercel.app/dashboard`

Their login is their API key (same one from the embed code).

---

## URLs when live

| URL | What it is |
|---|---|
| `yourdomain.com` | Marketing/pricing page |
| `yourdomain.com/widget.js` | The embeddable widget |
| `yourdomain.com/dashboard` | Contractor dashboard |
| `yourdomain.com/api/leads` | Lead submission endpoint |
| `yourdomain.com/api/config` | Widget config endpoint |
| `yourdomain.com/api/slots` | Booking slots endpoint |

---

## Adding regional pricing data

The schema seeds 20 common markets. To add more ZIPs:

```sql
INSERT INTO regional_pricing (zip_code, city, state, cost_multiplier)
VALUES ('90210', 'Beverly Hills', 'CA', 1.22);
```

Cost multipliers: `1.00` = national average. Phoenix is `0.94`, NYC is `1.35`.

---

## Stripe (when you're ready to charge)

Not included in this build — add when you have paying clients.
Recommended: [Stripe Checkout](https://stripe.com/docs/payments/checkout) with a
webhook that updates `plan` in `roofing_companies` on payment success.

---

## Support

Questions → growth@ardeablue.io
