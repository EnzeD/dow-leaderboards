-- Replace legacy premium activation gating with subscription snapshot table

drop table if exists public.premium_feature_activations cascade;

create table if not exists public.premium_subscriptions (
  auth0_sub text primary key references public.app_users(auth0_sub) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  cancel_at_period_end boolean,
  current_period_start timestamptz,
  current_period_end timestamptz,
  price_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.premium_subscriptions is
  'Stripe subscription snapshot keyed by Auth0 user.';

comment on column public.premium_subscriptions.status is
  'Latest subscription status from Stripe (e.g. active, trialing, canceled).';

comment on column public.premium_subscriptions.cancel_at_period_end is
  'Mirror of Stripe cancel_at_period_end flag.';

comment on column public.premium_subscriptions.current_period_end is
  'ISO timestamp when the current paid period ends.';

create index if not exists premium_subscriptions_customer_idx
  on public.premium_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists premium_subscriptions_subscription_idx
  on public.premium_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'premium_subscriptions_set_updated_at'
  ) then
    create trigger premium_subscriptions_set_updated_at
    before update on public.premium_subscriptions
    for each row execute function public.set_updated_at();
  end if;
end;
$$;
