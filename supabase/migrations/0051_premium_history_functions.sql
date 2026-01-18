-- Point premium analytics at premium_* tables for full history retention.

CREATE OR REPLACE FUNCTION public.premium_get_matchup_stats(
  p_profile_id bigint,
  p_since timestamptz DEFAULT (now() - interval '90 days'),
  p_match_type_id integer DEFAULT NULL
)
RETURNS TABLE (
  my_race_id smallint,
  opponent_race_id smallint,
  matches integer,
  wins integer,
  losses integer,
  winrate numeric,
  last_played timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      my.race_id AS my_race_id,
      opp.race_id AS opponent_race_id,
      my.outcome,
      m.completed_at
    FROM public.premium_match_participants my
    JOIN public.premium_match_participants opp
      ON opp.match_id = my.match_id
     AND opp.team_id <> my.team_id
    JOIN public.premium_matches m
      ON m.match_id = my.match_id
    WHERE my.profile_id = p_profile_id
      AND my.is_computer = false
      AND opp.is_computer = false
      AND (p_since IS NULL OR m.completed_at >= p_since)
      AND (
        p_match_type_id IS NULL
        OR (p_match_type_id >= 0 AND m.match_type_id = p_match_type_id)
        OR (p_match_type_id = -1 AND m.match_type_id IN (1, 2, 3, 4))
        OR (p_match_type_id = -2 AND (m.match_type_id IS NULL OR m.match_type_id NOT IN (1, 2, 3, 4)))
      )
  )
  SELECT
    b.my_race_id,
    b.opponent_race_id,
    count(*) AS matches,
    count(*) FILTER (WHERE b.outcome = 'win') AS wins,
    count(*) FILTER (WHERE b.outcome = 'loss') AS losses,
    CASE WHEN count(*) > 0 THEN (count(*) FILTER (WHERE b.outcome = 'win')::numeric / count(*)::numeric) ELSE NULL END AS winrate,
    max(b.completed_at) AS last_played
  FROM base b
  GROUP BY 1,2
  ORDER BY matches DESC, last_played DESC NULLS LAST;
$$;

COMMENT ON FUNCTION public.premium_get_matchup_stats IS
  'Aggregates wins and losses by faction matchup for a player; accepts sentinel match_type (-1 automatch, -2 custom).';

CREATE OR REPLACE FUNCTION public.premium_get_map_stats(
  p_profile_id bigint,
  p_since timestamptz DEFAULT (now() - interval '90 days'),
  p_match_type_id integer DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  map_identifier text,
  map_name text,
  match_type_id integer,
  matches integer,
  wins integer,
  losses integer,
  winrate numeric,
  last_played timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      coalesce(nullif(trim(m.map_name), ''), 'unknown') AS map_identifier,
      coalesce(nullif(m.map_name, ''), 'Unknown Map') AS map_name,
      m.match_type_id,
      my.outcome,
      m.completed_at
    FROM public.premium_match_participants my
    JOIN public.premium_matches m ON m.match_id = my.match_id
    WHERE my.profile_id = p_profile_id
      AND my.is_computer = false
      AND (p_since IS NULL OR m.completed_at >= p_since)
      AND (p_match_type_id IS NULL OR m.match_type_id = p_match_type_id)
  )
  SELECT
    b.map_identifier,
    b.map_name,
    b.match_type_id,
    count(*) AS matches,
    count(*) FILTER (WHERE b.outcome = 'win') AS wins,
    count(*) FILTER (WHERE b.outcome = 'loss') AS losses,
    CASE WHEN count(*) > 0 THEN (count(*) FILTER (WHERE b.outcome = 'win')::numeric / count(*)::numeric) ELSE NULL END AS winrate,
    max(b.completed_at) AS last_played
  FROM base b
  GROUP BY 1,2,3
  ORDER BY matches DESC, last_played DESC NULLS LAST
  LIMIT greatest(10, least(coalesce(p_limit, 50), 200));
$$;

COMMENT ON FUNCTION public.premium_get_map_stats IS
  'Returns per-map win/loss aggregates for a player, filtered by match type and time window.';

CREATE OR REPLACE FUNCTION public.premium_get_opponent_stats(
  p_profile_id bigint,
  p_since timestamptz DEFAULT (now() - interval '90 days'),
  p_match_type_id integer DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS TABLE (
  opponent_profile_id bigint,
  opponent_alias text,
  opponent_country text,
  opponent_main_race_id smallint,
  matches integer,
  wins integer,
  losses integer,
  winrate numeric,
  last_played timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
WITH base AS (
    SELECT
      opp.profile_id AS opponent_profile_id,
      coalesce(opp_player.current_alias, nullif(opp.alias_at_match, ''), opp.profile_id::text) AS opponent_alias,
      my.outcome,
      opp_player.country AS opponent_country,
      opp.race_id AS opponent_race_id,
      m.completed_at
    FROM public.premium_match_participants my
    JOIN public.premium_match_participants opp
      ON opp.match_id = my.match_id
     AND opp.team_id <> my.team_id
    JOIN public.premium_matches m ON m.match_id = my.match_id
    LEFT JOIN public.players opp_player ON opp_player.profile_id = opp.profile_id
    WHERE my.profile_id = p_profile_id
      AND my.is_computer = false
      AND my.team_id IS NOT NULL
      AND my.outcome IN ('win', 'loss')
      AND opp.is_computer = false
      AND opp.team_id IS NOT NULL
      AND opp.outcome IN ('win', 'loss')
      AND opp.profile_id IS NOT NULL
      AND (p_since IS NULL OR m.completed_at >= p_since)
      AND (
        p_match_type_id IS NULL
        OR (p_match_type_id >= 0 AND m.match_type_id = p_match_type_id)
        OR (p_match_type_id = -1 AND m.match_type_id IN (1, 2, 3, 4))
        OR (p_match_type_id = -2 AND (m.match_type_id IS NULL OR m.match_type_id NOT IN (1, 2, 3, 4)))
      )
  )
  SELECT
    b.opponent_profile_id,
    b.opponent_alias,
    max(b.opponent_country) AS opponent_country,
    mode() WITHIN GROUP (ORDER BY b.opponent_race_id) AS opponent_main_race_id,
    count(*) AS matches,
    count(*) FILTER (WHERE b.outcome = 'win') AS wins,
    count(*) FILTER (WHERE b.outcome = 'loss') AS losses,
    CASE WHEN count(*) > 0 THEN (count(*) FILTER (WHERE b.outcome = 'win')::numeric / count(*)::numeric) ELSE NULL END AS winrate,
    max(b.completed_at) AS last_played
  FROM base b
  GROUP BY b.opponent_profile_id, b.opponent_alias
  ORDER BY matches DESC, last_played DESC NULLS LAST
  LIMIT greatest(5, least(coalesce(p_limit, 10), 50));
$$;

COMMENT ON FUNCTION public.premium_get_opponent_stats IS
  'Returns the most frequent opponents for a player with win/loss records plus country/race metadata. Filters support match_type_id = -1 (automatch) and -2 (custom).';

CREATE OR REPLACE FUNCTION public.premium_get_opponent_match_history(
  p_profile_id bigint,
  p_opponent_profile_id bigint,
  p_since timestamptz DEFAULT (now() - interval '90 days'),
  p_match_type_id integer DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  match_id bigint,
  map_identifier text,
  map_name text,
  match_type_id integer,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  outcome text,
  old_rating integer,
  new_rating integer,
  rating_delta integer,
  team_id smallint,
  race_id smallint,
  players jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      m.match_id,
      coalesce(nullif(trim(m.map_name), ''), 'unknown') AS map_identifier,
      coalesce(nullif(m.map_name, ''), 'Unknown Map') AS map_name,
      m.match_type_id,
      m.started_at,
      m.completed_at,
      m.duration_seconds,
      my.outcome,
      my.old_rating,
      my.new_rating,
      my.rating_delta,
      my.team_id,
      my.race_id
    FROM public.premium_match_participants my
    JOIN public.premium_match_participants opp
      ON opp.match_id = my.match_id
     AND opp.profile_id = p_opponent_profile_id
     AND opp.team_id IS NOT NULL
     AND my.team_id IS NOT NULL
     AND opp.team_id <> my.team_id
    JOIN public.premium_matches m
      ON m.match_id = my.match_id
    WHERE my.profile_id = p_profile_id
      AND my.is_computer = false
      AND my.team_id IS NOT NULL
      AND my.outcome IN ('win', 'loss')
      AND opp.is_computer = false
      AND opp.team_id IS NOT NULL
      AND opp.outcome IN ('win', 'loss')
      AND (p_since IS NULL OR m.completed_at >= p_since)
      AND (
        p_match_type_id IS NULL
        OR (p_match_type_id >= 0 AND m.match_type_id = p_match_type_id)
        OR (p_match_type_id = -1 AND m.match_type_id IN (1, 2, 3, 4))
        OR (p_match_type_id = -2 AND (m.match_type_id IS NULL OR m.match_type_id NOT IN (1, 2, 3, 4)))
      )
  )
  SELECT
    b.match_id,
    b.map_identifier,
    b.map_name,
    b.match_type_id,
    b.started_at,
    b.completed_at,
    b.duration_seconds,
    coalesce(nullif(b.outcome::text, ''), 'unknown') AS outcome,
    b.old_rating,
    b.new_rating,
    b.rating_delta,
    b.team_id,
    b.race_id,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'profileId', mp.profile_id::text,
        'alias', coalesce(player.current_alias, nullif(mp.alias_at_match, ''), mp.profile_id::text),
        'teamId', mp.team_id,
        'raceId', mp.race_id,
        'oldRating', mp.old_rating,
        'newRating', mp.new_rating
      ) ORDER BY mp.team_id, mp.profile_id)
      FROM public.premium_match_participants mp
      LEFT JOIN public.players player ON player.profile_id = mp.profile_id
      WHERE mp.match_id = b.match_id
        AND mp.is_computer = false
        AND mp.team_id IS NOT NULL
    ) AS players
  FROM base b
  ORDER BY b.completed_at DESC NULLS LAST
  LIMIT greatest(5, least(coalesce(p_limit, 50), 100));
$$;

COMMENT ON FUNCTION public.premium_get_opponent_match_history IS
  'Returns recent matches between a player and a specific opponent, including roster details.';

CREATE OR REPLACE FUNCTION public.premium_get_matchup_match_history(
  p_profile_id bigint,
  p_my_race_id integer,
  p_opponent_race_id integer,
  p_since timestamptz DEFAULT (now() - interval '90 days'),
  p_match_type_id integer DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  match_id bigint,
  map_identifier text,
  map_name text,
  match_type_id integer,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  outcome text,
  old_rating integer,
  new_rating integer,
  rating_delta integer,
  team_id smallint,
  race_id smallint,
  opponent_race_id smallint,
  players jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      m.match_id,
      coalesce(nullif(trim(m.map_name), ''), 'unknown') AS map_identifier,
      coalesce(nullif(m.map_name, ''), 'Unknown Map') AS map_name,
      m.match_type_id,
      m.started_at,
      m.completed_at,
      m.duration_seconds,
      my.outcome,
      my.old_rating,
      my.new_rating,
      my.rating_delta,
      my.team_id,
      my.race_id,
      opp.race_id AS opponent_race_id
    FROM public.premium_match_participants my
    JOIN public.premium_match_participants opp
      ON opp.match_id = my.match_id
     AND opp.team_id IS NOT NULL
     AND my.team_id IS NOT NULL
     AND opp.team_id <> my.team_id
    JOIN public.premium_matches m ON m.match_id = my.match_id
    WHERE my.profile_id = p_profile_id
      AND my.is_computer = false
      AND opp.is_computer = false
      AND my.outcome IN ('win', 'loss')
      AND opp.outcome IN ('win', 'loss')
      AND my.race_id = p_my_race_id
      AND opp.race_id = p_opponent_race_id
      AND (p_since IS NULL OR m.completed_at >= p_since)
      AND (
        p_match_type_id IS NULL
        OR (p_match_type_id >= 0 AND m.match_type_id = p_match_type_id)
        OR (p_match_type_id = -1 AND m.match_type_id IN (1, 2, 3, 4))
        OR (p_match_type_id = -2 AND (m.match_type_id IS NULL OR m.match_type_id NOT IN (1, 2, 3, 4)))
      )
  )
  SELECT
    b.match_id,
    b.map_identifier,
    b.map_name,
    b.match_type_id,
    b.started_at,
    b.completed_at,
    b.duration_seconds,
    coalesce(nullif(b.outcome::text, ''), 'unknown') AS outcome,
    b.old_rating,
    b.new_rating,
    b.rating_delta,
    b.team_id,
    b.race_id,
    b.opponent_race_id,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'profileId', mp.profile_id::text,
        'alias', coalesce(player.current_alias, nullif(mp.alias_at_match, ''), mp.profile_id::text),
        'teamId', mp.team_id,
        'raceId', mp.race_id,
        'oldRating', mp.old_rating,
        'newRating', mp.new_rating
      ) ORDER BY mp.team_id, mp.profile_id)
      FROM public.premium_match_participants mp
      LEFT JOIN public.players player ON player.profile_id = mp.profile_id
      WHERE mp.match_id = b.match_id
        AND mp.is_computer = false
        AND mp.team_id IS NOT NULL
    ) AS players
  FROM base b
  ORDER BY b.completed_at DESC NULLS LAST
  LIMIT greatest(5, least(coalesce(p_limit, 50), 100));
$$;

COMMENT ON FUNCTION public.premium_get_matchup_match_history IS
  'Returns recent matches for a specific faction match-up, including roster metadata.';

CREATE OR REPLACE FUNCTION public.premium_get_map_match_history(
  p_profile_id bigint,
  p_map_identifier text,
  p_since timestamptz DEFAULT (now() - interval '90 days'),
  p_match_type_id integer DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  match_id bigint,
  map_identifier text,
  map_name text,
  match_type_id integer,
  started_at timestamptz,
  completed_at timestamptz,
  duration_seconds integer,
  outcome text,
  old_rating integer,
  new_rating integer,
  rating_delta integer,
  team_id smallint,
  race_id smallint,
  players jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      m.match_id,
      coalesce(nullif(trim(m.map_name), ''), 'unknown') AS map_identifier,
      coalesce(nullif(m.map_name, ''), 'Unknown Map') AS map_name,
      m.match_type_id,
      m.started_at,
      m.completed_at,
      m.duration_seconds,
      my.outcome,
      my.old_rating,
      my.new_rating,
      my.rating_delta,
      my.team_id,
      my.race_id
    FROM public.premium_match_participants my
    JOIN public.premium_matches m ON m.match_id = my.match_id
    WHERE my.profile_id = p_profile_id
      AND my.is_computer = false
      AND my.team_id IS NOT NULL
      AND my.outcome IN ('win', 'loss')
      AND (p_since IS NULL OR m.completed_at >= p_since)
      AND (
        p_match_type_id IS NULL
        OR (p_match_type_id >= 0 AND m.match_type_id = p_match_type_id)
        OR (p_match_type_id = -1 AND m.match_type_id IN (1, 2, 3, 4))
        OR (p_match_type_id = -2 AND (m.match_type_id IS NULL OR m.match_type_id NOT IN (1, 2, 3, 4)))
      )
  ), filtered AS (
    SELECT *
    FROM base
    WHERE map_identifier = coalesce(nullif(trim(p_map_identifier), ''), 'unknown')
  )
  SELECT
    f.match_id,
    f.map_identifier,
    f.map_name,
    f.match_type_id,
    f.started_at,
    f.completed_at,
    f.duration_seconds,
    coalesce(nullif(f.outcome::text, ''), 'unknown') AS outcome,
    f.old_rating,
    f.new_rating,
    f.rating_delta,
    f.team_id,
    f.race_id,
    (
      SELECT jsonb_agg(jsonb_build_object(
        'profileId', mp.profile_id::text,
        'alias', coalesce(player.current_alias, nullif(mp.alias_at_match, ''), mp.profile_id::text),
        'teamId', mp.team_id,
        'raceId', mp.race_id,
        'oldRating', mp.old_rating,
        'newRating', mp.new_rating
      ) ORDER BY mp.team_id, mp.profile_id)
      FROM public.premium_match_participants mp
      LEFT JOIN public.players player ON player.profile_id = mp.profile_id
      WHERE mp.match_id = f.match_id
        AND mp.is_computer = false
        AND mp.team_id IS NOT NULL
    ) AS players
  FROM filtered f
  ORDER BY f.completed_at DESC NULLS LAST
  LIMIT greatest(5, least(coalesce(p_limit, 50), 100));
$$;

COMMENT ON FUNCTION public.premium_get_map_match_history IS
  'Returns recent matches for a given map, including roster metadata and player outcomes.';

CREATE OR REPLACE FUNCTION public.premium_get_profile_overview(
  p_profile_id bigint
)
RETURNS TABLE (
  profile_id bigint,
  total_matches bigint,
  matches_last_7_days bigint,
  total_wins bigint,
  total_losses bigint,
  winrate numeric,
  last_xp_sync timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id_str text := p_profile_id::text;
  v_total_matches bigint;
  v_matches_last_7_days bigint;
  v_total_wins bigint := 0;
  v_total_losses bigint := 0;
  v_winrate numeric;
  v_last_xp_sync timestamptz;
BEGIN
  SELECT
    count(*),
    count(*) FILTER (WHERE m.completed_at >= (now() - interval '7 days'))
  INTO v_total_matches, v_matches_last_7_days
  FROM public.premium_match_participants mp
  JOIN public.premium_matches m ON m.match_id = mp.match_id
  WHERE mp.profile_id = p_profile_id
    AND mp.is_computer = false;

  SELECT
    coalesce(sum(wins), 0)::bigint,
    coalesce(sum(losses), 0)::bigint
  INTO v_total_wins, v_total_losses
  FROM public.leaderboard_standings
  WHERE profile_id = v_profile_id_str;

  IF (v_total_wins + v_total_losses) > 0 THEN
    v_winrate := v_total_wins::numeric / (v_total_wins + v_total_losses)::numeric;
  ELSE
    v_winrate := NULL;
  END IF;

  SELECT
    greatest(
      coalesce(last_seen_at, '-infinity'::timestamptz),
      coalesce(updated_at, '-infinity'::timestamptz)
    )
  INTO v_last_xp_sync
  FROM public.players
  WHERE players.profile_id = p_profile_id;

  RETURN QUERY SELECT
    p_profile_id,
    v_total_matches,
    v_matches_last_7_days,
    v_total_wins,
    v_total_losses,
    v_winrate,
    v_last_xp_sync;
END;
$$;

COMMENT ON FUNCTION public.premium_get_profile_overview IS
  'Returns overview stats for a player profile including total matches, recent activity, and leaderboard win/loss records from current standings.';
