-- Fix sync_premium_match_history CTE scope by materializing temp tables.
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
  DROP TABLE IF EXISTS tmp_premium_profiles;
  DROP TABLE IF EXISTS tmp_matches_in_scope;

  CREATE TEMP TABLE tmp_premium_profiles ON COMMIT DROP AS
    SELECT DISTINCT au.primary_profile_id AS profile_id
    FROM public.app_users au
    JOIN public.premium_subscriptions ps ON ps.auth0_sub = au.auth0_sub
    WHERE au.primary_profile_id IS NOT NULL
      AND ps.status IN ('active', 'trialing', 'past_due')
      AND (ps.current_period_end IS NULL OR ps.current_period_end > now());

  CREATE TEMP TABLE tmp_matches_in_scope ON COMMIT DROP AS
    SELECT DISTINCT mp.match_id
    FROM public.match_participants mp
    JOIN tmp_premium_profiles pp ON pp.profile_id = mp.profile_id
    JOIN public.matches m ON m.match_id = mp.match_id
    WHERE p_since IS NULL
      OR m.crawled_at >= p_since
      OR m.completed_at >= p_since;

  CREATE INDEX ON tmp_matches_in_scope (match_id);

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
  JOIN tmp_matches_in_scope mis ON mis.match_id = m.match_id
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
  JOIN tmp_matches_in_scope mis ON mis.match_id = mp.match_id
  ON CONFLICT (match_id, profile_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.sync_premium_match_history IS
  'Copies recent matches involving active premium profiles into premium_* tables for long-term retention.';
