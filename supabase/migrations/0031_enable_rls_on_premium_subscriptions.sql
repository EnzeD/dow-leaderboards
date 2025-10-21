-- Enable row level security on premium_subscriptions and define access policies

alter table if exists public.premium_subscriptions enable row level security;

drop policy if exists "service_manage_premium_subscriptions" on public.premium_subscriptions;
create policy "service_manage_premium_subscriptions"
  on public.premium_subscriptions
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists "authenticated_read_own_subscription" on public.premium_subscriptions;
create policy "authenticated_read_own_subscription"
  on public.premium_subscriptions
  for select
  to authenticated
  using (auth.jwt() ->> 'sub' = auth0_sub);

comment on policy "service_manage_premium_subscriptions" on public.premium_subscriptions is
  'Allow Supabase service role to manage subscription snapshots.';

comment on policy "authenticated_read_own_subscription" on public.premium_subscriptions is
  'Authenticated users can read their own subscription snapshot based on the Auth0 subject.';
