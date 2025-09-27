-- Premium interest lead capture for advanced statistics upsell
create extension if not exists "pgcrypto";

create table if not exists public.premium_interest_leads (
  id uuid primary key default gen_random_uuid(),
  alias_submitted text not null,
  profile_id text,
  player_name text,
  survey_choice text check (
    survey_choice is null
    or survey_choice in ('No', '$2.99/month', '$4.99/month')
  ),
  email text,
  source text not null default 'search_teaser',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists premium_interest_leads_set_updated_at on public.premium_interest_leads;
create trigger premium_interest_leads_set_updated_at
before update on public.premium_interest_leads
for each row execute function public.set_updated_at();

create unique index if not exists premium_interest_leads_email_key
on public.premium_interest_leads (lower(email))
where email is not null;

create unique index if not exists premium_interest_leads_profile_key
on public.premium_interest_leads (coalesce(profile_id, lower(alias_submitted)));

alter table public.premium_interest_leads enable row level security;

drop policy if exists "service can insert" on public.premium_interest_leads;
create policy "service can insert"
on public.premium_interest_leads
for insert
to service_role
with check (true);

drop policy if exists "service can update" on public.premium_interest_leads;
create policy "service can update"
on public.premium_interest_leads
for update
to service_role
using (true)
with check (true);
