-- ============================================================
-- RoofIQ Schema Update — run after supabase-schema.sql
-- Adds email queue for automated follow-up sequences
-- ============================================================

create table if not exists email_queue (
  id                  uuid primary key default uuid_generate_v4(),
  created_at          timestamptz default now(),
  roofing_company_id  uuid references roofing_companies(id),
  email               text not null,
  company_name        text,
  template            text not null,   -- trial_day7 | trial_day10 | trial_day13
  send_after          timestamptz not null,
  sent                boolean default false,
  sent_at             timestamptz
);

create index if not exists eq_send_after_idx on email_queue(send_after) where sent = false;

alter table email_queue enable row level security;
create policy "service role only email_queue" on email_queue using (false);

-- Update roofing_companies to add contact_name field
alter table roofing_companies add column if not exists contact_name text;
