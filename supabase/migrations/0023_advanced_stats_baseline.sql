-- Advanced statistics activation scaffolding
-- Introduces premium_feature_activations table used to gate premium analytics

create table if not exists public.premium_feature_activations (
  profile_id bigint primary key references public.players(profile_id) on delete cascade,
  activated_at timestamptz not null default now(),
  expires_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_expires_after_activation
    check (expires_at is null or expires_at >= activated_at)
);

comment on table public.premium_feature_activations is
  'Tracks which player profiles have access to premium/advanced statistics.';

comment on column public.premium_feature_activations.profile_id is
  'Player profile receiving premium analytics access (matches players.profile_id).';

comment on column public.premium_feature_activations.activated_at is
  'Timestamp when premium access became effective.';

comment on column public.premium_feature_activations.expires_at is
  'Optional timestamp when premium access should expire.';

comment on column public.premium_feature_activations.notes is
  'Operator notes about activation source (e.g. manual grant, promo).';

-- Maintain updated_at automatically
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE  tgname = 'premium_feature_activations_set_updated_at'
  ) THEN
    CREATE TRIGGER premium_feature_activations_set_updated_at
    BEFORE UPDATE ON public.premium_feature_activations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

-- RLS configuration (disabled by default for anon/authenticated clients)
alter table public.premium_feature_activations enable row level security;

drop policy if exists "service can manage premium activations" on public.premium_feature_activations;
create policy "service can manage premium activations"
on public.premium_feature_activations
for all
to service_role
using (true)
with check (true);
