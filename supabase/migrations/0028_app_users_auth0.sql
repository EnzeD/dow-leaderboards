create table if not exists public.app_users (
  auth0_sub text primary key,
  email text,
  email_verified boolean,
  stripe_customer_id text,
  stripe_subscription_id text,
  premium_expires_at timestamptz,
  primary_profile_id bigint references public.players(profile_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.app_users is
  'Application users authenticated via Auth0; stores Stripe linkage and premium state.';

create unique index if not exists app_users_email_idx
  on public.app_users (lower(email))
  where email is not null;

create index if not exists app_users_primary_profile_idx
  on public.app_users (primary_profile_id)
  where primary_profile_id is not null;

alter table public.app_users enable row level security;

drop policy if exists "users_read_self" on public.app_users;
create policy "users_read_self"
  on public.app_users
  for select
  using (auth.jwt() ->> 'sub' = auth0_sub);

drop policy if exists "users_update_self" on public.app_users;
create policy "users_update_self"
  on public.app_users
  for update
  using (auth.jwt() ->> 'sub' = auth0_sub)
  with check (auth.jwt() ->> 'sub' = auth0_sub);

drop policy if exists "service_manage_app_users" on public.app_users;
create policy "service_manage_app_users"
  on public.app_users
  for all
  to service_role
  using (true)
  with check (true);

-- Keep updated_at in sync
do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'app_users_set_updated_at'
  ) then
    create trigger app_users_set_updated_at
    before update on public.app_users
    for each row execute function public.set_updated_at();
  end if;
end;
$$;
