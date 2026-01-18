-- Store full match history for premium profiles.
CREATE TABLE IF NOT EXISTS public.premium_matches (
  match_id bigint PRIMARY KEY,
  match_type_id integer NOT NULL REFERENCES public.match_types(id),
  map_name text,
  max_players smallint,
  creator_profile_id bigint,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  crawled_at timestamptz,
  source_alias text
);

CREATE INDEX IF NOT EXISTS premium_matches_completed_at_idx
  ON public.premium_matches (completed_at);

CREATE INDEX IF NOT EXISTS premium_matches_type_completed_idx
  ON public.premium_matches (match_type_id, completed_at);

CREATE TABLE IF NOT EXISTS public.premium_match_participants (
  match_id bigint NOT NULL REFERENCES public.premium_matches(match_id) ON DELETE CASCADE,
  profile_id bigint NOT NULL REFERENCES public.players(profile_id),
  team_id smallint,
  race_id smallint REFERENCES public.races(id),
  alias_at_match text,
  outcome match_outcome NOT NULL DEFAULT 'unknown',
  old_rating integer,
  new_rating integer,
  rating_delta integer,
  is_computer boolean NOT NULL DEFAULT false,
  PRIMARY KEY (match_id, profile_id)
);

CREATE INDEX IF NOT EXISTS premium_match_participants_profile_timeline_idx
  ON public.premium_match_participants (profile_id, match_id DESC);

CREATE INDEX IF NOT EXISTS premium_match_participants_match_team_idx
  ON public.premium_match_participants (match_id, team_id);

ALTER TABLE public.premium_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_match_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_manage_premium_matches" ON public.premium_matches;
CREATE POLICY "service_manage_premium_matches"
  ON public.premium_matches
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "service_manage_premium_match_participants" ON public.premium_match_participants;
CREATE POLICY "service_manage_premium_match_participants"
  ON public.premium_match_participants
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sync_premium_match_history(
  p_since timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
BEGIN
  WITH premium_profiles AS (
    SELECT DISTINCT au.primary_profile_id AS profile_id
    FROM public.app_users au
    JOIN public.premium_subscriptions ps ON ps.auth0_sub = au.auth0_sub
    WHERE au.primary_profile_id IS NOT NULL
      AND ps.status IN ('active', 'trialing', 'past_due')
      AND (ps.current_period_end IS NULL OR ps.current_period_end > now())
  ),
  matches_in_scope AS (
    SELECT DISTINCT mp.match_id
    FROM public.match_participants mp
    JOIN premium_profiles pp ON pp.profile_id = mp.profile_id
    JOIN public.matches m ON m.match_id = mp.match_id
    WHERE p_since IS NULL
      OR m.crawled_at >= p_since
      OR m.completed_at >= p_since
  )
  INSERT INTO public.premium_matches (
    match_id,
    match_type_id,
    map_name,
    max_players,
    creator_profile_id,
    started_at,
    completed_at,
    duration_seconds,
    crawled_at,
    source_alias
  )
  SELECT
    m.match_id,
    m.match_type_id,
    m.map_name,
    m.max_players,
    m.creator_profile_id,
    m.started_at,
    m.completed_at,
    m.duration_seconds,
    m.crawled_at,
    m.source_alias
  FROM public.matches m
  JOIN matches_in_scope mis ON mis.match_id = m.match_id
  ON CONFLICT (match_id) DO NOTHING;

  INSERT INTO public.premium_match_participants (
    match_id,
    profile_id,
    team_id,
    race_id,
    alias_at_match,
    outcome,
    old_rating,
    new_rating,
    rating_delta,
    is_computer
  )
  SELECT
    mp.match_id,
    mp.profile_id,
    mp.team_id,
    mp.race_id,
    mp.alias_at_match,
    mp.outcome,
    mp.old_rating,
    mp.new_rating,
    mp.rating_delta,
    mp.is_computer
  FROM public.match_participants mp
  JOIN matches_in_scope mis ON mis.match_id = mp.match_id
  ON CONFLICT (match_id, profile_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.sync_premium_match_history IS
  'Copies recent matches involving active premium profiles into premium_* tables for long-term retention.';
