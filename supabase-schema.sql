-- ============================================================
-- RoofIQ Supabase Schema
-- Run this entire file in your Supabase SQL Editor once.
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── 1. Roofing companies (your paying clients) ──────────────
create table if not exists roofing_companies (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz default now(),
  company_name    text not null,
  email           text not null unique,        -- contractor login + lead email
  phone           text,                        -- SMS alerts go here
  plan            text default 'starter'       -- starter | essentials | growth | pro
                  check (plan in ('starter','essentials','growth','pro')),
  plan_started_at timestamptz default now(),
  api_key         text unique default encode(gen_random_bytes(24), 'hex'),
  trial_uses_left int  default 25,
  trial_started   timestamptz default now(),
  -- Branding
  logo_url        text,
  primary_color   text default '#c84b11',
  tagline         text default 'Free Instant Roof Estimate',
  -- Booking availability (JSON array of day/time slots)
  -- e.g. [{"day":"Mon","start":"09:00","end":"17:00"},...]
  availability    jsonb default '[]',
  -- Notification prefs
  sms_alerts      boolean default false,
  email_alerts    boolean default true,
  -- Stripe
  stripe_customer_id      text,
  stripe_subscription_id  text
);

-- ── 2. Regional pricing multipliers ────────────────────────
create table if not exists regional_pricing (
  id            uuid primary key default uuid_generate_v4(),
  zip_code      text not null,
  city          text,
  state         text,
  cost_multiplier numeric(4,3) default 1.000,
  unique(zip_code)
);

-- Seed a handful of common markets
insert into regional_pricing (zip_code, city, state, cost_multiplier) values
  ('85001','Phoenix','AZ',0.940),
  ('85021','Phoenix','AZ',0.940),
  ('85032','Phoenix','AZ',0.940),
  ('85251','Scottsdale','AZ',0.980),
  ('85701','Tucson','AZ',0.910),
  ('80001','Denver','CO',1.060),
  ('80202','Denver','CO',1.060),
  ('90001','Los Angeles','CA',1.180),
  ('90210','Beverly Hills','CA',1.220),
  ('77001','Houston','TX',0.960),
  ('78201','San Antonio','TX',0.930),
  ('30301','Atlanta','GA',1.000),
  ('33101','Miami','FL',1.020),
  ('60601','Chicago','IL',1.120),
  ('10001','New York','NY',1.350),
  ('98101','Seattle','WA',1.140),
  ('97201','Portland','OR',1.090),
  ('37201','Nashville','TN',0.980),
  ('28201','Charlotte','NC',0.970),
  ('23201','Richmond','VA',0.990)
on conflict (zip_code) do nothing;

-- ── 3. Installer tiers ──────────────────────────────────────
create table if not exists installer_tiers (
  id                      uuid primary key default uuid_generate_v4(),
  tier_name               text unique not null,   -- good | better | best
  display_name            text,
  base_cost_per_square    numeric(8,2) default 130.00,
  tier_multiplier         numeric(4,3) default 1.000,
  shingle_type            text,
  description             text
);

insert into installer_tiers
  (tier_name, display_name, base_cost_per_square, tier_multiplier, shingle_type, description)
values
  ('good',   'Good',   130, 1.000, '25-yr Architectural Shingles', 'Standard materials, licensed & insured'),
  ('better', 'Better', 130, 1.180, 'Lifetime Architectural Shingles', 'Enhanced protection & lifetime warranty'),
  ('best',   'Best',   130, 1.450, 'Premium / Designer Shingles', 'Premium materials & elite craftsmanship')
on conflict (tier_name) do nothing;

-- ── 4. Widget leads ─────────────────────────────────────────
create table if not exists leads (
  id                  uuid primary key default uuid_generate_v4(),
  created_at          timestamptz default now(),
  -- Company association
  roofing_company_id  uuid references roofing_companies(id),
  api_key             text,
  -- Homeowner info
  name                text,
  email               text,
  phone               text,
  -- Estimate details
  zip_code            text,
  city                text,
  state               text,
  size_id             text,    -- sm | md | lg | xl
  pitch_id            text,    -- flat | mid | steep
  quality_id          text,    -- good | better | best
  squares             int,
  est_low             numeric(10,2),
  est_mid             numeric(10,2),
  est_high            numeric(10,2),
  shingle_type        text,
  monthly_payment     numeric(8,2),
  -- Qualifiers
  roof_age            text,
  stories             text,
  insurance_flag      boolean default false,
  insurance_note      text,
  -- Scoring
  score               text default 'warm'
                      check (score in ('hot','warm','cold')),
  -- Booking
  booked_at           timestamptz,
  booking_slot        text,     -- ISO datetime string of chosen slot
  -- Status
  status              text default 'new'
                      check (status in ('new','contacted','booked','closed','lost')),
  -- NOAA
  noaa_event_date     text,
  noaa_hail_size      text,
  noaa_verified       boolean default false
);

create index if not exists leads_company_idx on leads(roofing_company_id);
create index if not exists leads_zip_idx     on leads(zip_code);
create index if not exists leads_created_idx on leads(created_at desc);

-- ── 5. Booking slots ────────────────────────────────────────
create table if not exists booking_slots (
  id                  uuid primary key default uuid_generate_v4(),
  roofing_company_id  uuid references roofing_companies(id),
  slot_start          timestamptz not null,
  slot_end            timestamptz not null,
  lead_id             uuid references leads(id),
  booked              boolean default false,
  created_at          timestamptz default now()
);

create index if not exists slots_company_idx on booking_slots(roofing_company_id);
create index if not exists slots_start_idx   on booking_slots(slot_start);

-- ── 6. Estimate log (anonymous, for analytics) ───────────────
create table if not exists estimate_log (
  id                  uuid primary key default uuid_generate_v4(),
  created_at          timestamptz default now(),
  api_key             text,
  roofing_company_id  uuid references roofing_companies(id),
  zip_code            text,
  size_id             text,
  pitch_id            text,
  quality_id          text,
  est_mid             numeric(10,2),
  converted           boolean default false   -- true when lead submitted
);

-- ── 7. Row Level Security ────────────────────────────────────
alter table roofing_companies enable row level security;
alter table leads              enable row level security;
alter table booking_slots      enable row level security;
alter table estimate_log       enable row level security;
alter table regional_pricing   enable row level security;
alter table installer_tiers    enable row level security;

-- Public read for pricing/tiers (widget needs these)
create policy "public read regional_pricing"
  on regional_pricing for select using (true);

create policy "public read installer_tiers"
  on installer_tiers for select using (true);

-- Leads: insert via anon (widget), read/update via service role only
create policy "anon insert leads"
  on leads for insert with check (true);

create policy "anon insert estimate_log"
  on estimate_log for insert with check (true);

-- Booking slots: read available slots publicly, insert/update via service
create policy "public read available slots"
  on booking_slots for select using (booked = false);

-- Widget config: read own config by api_key
create policy "widget read own config"
  on roofing_companies for select
  using (true);  -- api_key validated in application layer
