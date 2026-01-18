-- Daily rollups to preserve long-term stats while pruning raw match history.

CREATE TABLE IF NOT EXISTS public.stats_daily_summary (
  match_day date not null,
  rating_floor integer not null,
  matches integer not null,
  last_played timestamptz,
  computed_at timestamptz not null default now(),
  PRIMARY KEY (match_day, rating_floor)
);

CREATE TABLE IF NOT EXISTS public.stats_daily_map_overview (
  match_day date not null,
  rating_floor integer not null,
  map_identifier text not null,
  map_name text not null,
  matches integer not null,
  wins integer not null,
  losses integer not null,
  last_played timestamptz,
  computed_at timestamptz not null default now(),
  PRIMARY KEY (match_day, rating_floor, map_identifier)
);

CREATE TABLE IF NOT EXISTS public.stats_daily_map_race_breakdown (
  match_day date not null,
  rating_floor integer not null,
  map_identifier text not null,
  race_id smallint not null,
  matches integer not null,
  wins integer not null,
  losses integer not null,
  last_played timestamptz,
  computed_at timestamptz not null default now(),
  PRIMARY KEY (match_day, rating_floor, map_identifier, race_id)
);

CREATE TABLE IF NOT EXISTS public.stats_daily_map_race_matchups (
  match_day date not null,
  rating_floor integer not null,
  map_identifier text not null,
  my_race_id smallint not null,
  opponent_race_id smallint not null,
  matches integer not null,
  wins integer not null,
  losses integer not null,
  last_played timestamptz,
  computed_at timestamptz not null default now(),
  PRIMARY KEY (match_day, rating_floor, map_identifier, my_race_id, opponent_race_id)
);

CREATE TABLE IF NOT EXISTS public.stats_daily_matchup_matrix (
  match_day date not null,
  rating_floor integer not null,
  my_race_id smallint not null,
  opponent_race_id smallint not null,
  matches integer not null,
  wins integer not null,
  losses integer not null,
  last_played timestamptz,
  computed_at timestamptz not null default now(),
  PRIMARY KEY (match_day, rating_floor, my_race_id, opponent_race_id)
);

CREATE TABLE IF NOT EXISTS public.stats_daily_race_pickrate (
  match_day date not null,
  rating_floor integer not null,
  race_id smallint not null,
  pick_count integer not null,
  match_count integer not null,
  computed_at timestamptz not null default now(),
  PRIMARY KEY (match_day, rating_floor, race_id)
);

CREATE INDEX IF NOT EXISTS stats_daily_summary_day_idx
  ON public.stats_daily_summary (match_day, rating_floor);

CREATE INDEX IF NOT EXISTS stats_daily_map_overview_day_idx
  ON public.stats_daily_map_overview (match_day, rating_floor, matches desc);

CREATE INDEX IF NOT EXISTS stats_daily_map_race_breakdown_day_idx
  ON public.stats_daily_map_race_breakdown (match_day, rating_floor, map_identifier);

CREATE INDEX IF NOT EXISTS stats_daily_map_race_matchups_day_idx
  ON public.stats_daily_map_race_matchups (match_day, rating_floor, map_identifier);

CREATE INDEX IF NOT EXISTS stats_daily_matchup_matrix_day_idx
  ON public.stats_daily_matchup_matrix (match_day, rating_floor);

CREATE INDEX IF NOT EXISTS stats_daily_race_pickrate_day_idx
  ON public.stats_daily_race_pickrate (match_day, rating_floor);

CREATE OR REPLACE FUNCTION public.stats_rollup_daily(
  p_start date,
  p_end date
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  start_date date := p_start;
  end_date date := p_end;
  start_ts timestamptz;
  end_ts timestamptz;
  now_ts timestamptz := clock_timestamp();
  rating_thresholds constant integer[] := array[0, 1200, 1400];
BEGIN
  IF start_date IS NULL OR end_date IS NULL THEN
    RAISE EXCEPTION 'p_start and p_end are required';
  END IF;

  IF end_date < start_date THEN
    RAISE EXCEPTION 'p_end must be on or after p_start';
  END IF;

  start_ts := start_date::timestamptz;
  end_ts := (end_date + 1)::timestamptz;

  DELETE FROM public.stats_daily_summary
    WHERE match_day BETWEEN start_date AND end_date;
  DELETE FROM public.stats_daily_map_overview
    WHERE match_day BETWEEN start_date AND end_date;
  DELETE FROM public.stats_daily_map_race_breakdown
    WHERE match_day BETWEEN start_date AND end_date;
  DELETE FROM public.stats_daily_map_race_matchups
    WHERE match_day BETWEEN start_date AND end_date;
  DELETE FROM public.stats_daily_matchup_matrix
    WHERE match_day BETWEEN start_date AND end_date;
  DELETE FROM public.stats_daily_race_pickrate
    WHERE match_day BETWEEN start_date AND end_date;

  CREATE TEMPORARY TABLE tmp_rating_params (rating_floor integer not null)
  ON COMMIT DROP;

  INSERT INTO tmp_rating_params (rating_floor)
  SELECT unnest(rating_thresholds);

  CREATE TEMPORARY TABLE tmp_matches
  ON COMMIT DROP AS
  SELECT
    m.match_id,
    m.completed_at,
    coalesce(nullif(trim(m.map_name), ''), 'unknown') as map_identifier,
    coalesce(nullif(m.map_name, ''), 'Unknown Map') as map_name
  FROM public.matches m
  WHERE m.match_type_id = 1
    AND m.completed_at IS NOT NULL
    AND m.completed_at >= start_ts
    AND m.completed_at < end_ts;

  CREATE INDEX ON tmp_matches (completed_at);

  CREATE TEMPORARY TABLE tmp_participants
  ON COMMIT DROP AS
  SELECT
    mp.match_id,
    mp.team_id,
    mp.race_id,
    mp.outcome,
    mp.is_computer,
    mp.new_rating,
    tm.completed_at,
    tm.map_identifier,
    tm.map_name
  FROM public.match_participants mp
  JOIN tmp_matches tm ON tm.match_id = mp.match_id;

  CREATE INDEX ON tmp_participants (match_id);

  CREATE TEMPORARY TABLE tmp_eligible_matches
  ON COMMIT DROP AS
  SELECT
    match_id,
    min(case when is_computer = false and new_rating is not null then new_rating end) as min_human_rating,
    bool_or(is_computer = false and new_rating is null) as has_null_rating
  FROM tmp_participants
  GROUP BY match_id
  HAVING
    count(*) filter (where is_computer = false and team_id is not null) = 2
    AND count(*) filter (where is_computer = true) = 0;

  CREATE INDEX ON tmp_eligible_matches (match_id);

  CREATE TEMPORARY TABLE tmp_human_participants
  ON COMMIT DROP AS
  SELECT
    tp.match_id,
    tp.team_id,
    tp.race_id,
    tp.outcome,
    tp.completed_at,
    tp.map_identifier,
    tp.map_name,
    tem.min_human_rating,
    tem.has_null_rating
  FROM tmp_participants tp
  JOIN tmp_eligible_matches tem ON tem.match_id = tp.match_id
  WHERE tp.is_computer = false
    AND tp.team_id IS NOT NULL
    AND tp.race_id IS NOT NULL;

  CREATE INDEX ON tmp_human_participants (match_id);
  CREATE INDEX ON tmp_human_participants (completed_at);

  CREATE TEMPORARY TABLE tmp_baseline_outcomes
  ON COMMIT DROP AS
  SELECT DISTINCT ON (hp.match_id)
    hp.match_id,
    hp.outcome
  FROM tmp_human_participants hp
  ORDER BY hp.match_id, hp.team_id;

  CREATE INDEX ON tmp_baseline_outcomes (match_id);

  INSERT INTO public.stats_daily_summary (
    match_day,
    rating_floor,
    matches,
    last_played,
    computed_at
  )
  WITH match_rows AS (
    SELECT
      tm.match_id,
      tm.completed_at,
      tem.min_human_rating,
      tem.has_null_rating
    FROM tmp_matches tm
    JOIN tmp_eligible_matches tem ON tem.match_id = tm.match_id
  ),
  rated_matches AS (
    SELECT
      date_trunc('day', mr.completed_at)::date as match_day,
      rf.rating_floor,
      mr.completed_at
    FROM match_rows mr
    JOIN LATERAL (
      SELECT rp.rating_floor
      FROM tmp_rating_params rp
      WHERE rp.rating_floor = 0
        OR (mr.has_null_rating = false AND mr.min_human_rating IS NOT NULL AND mr.min_human_rating >= rp.rating_floor)
    ) rf ON true
  )
  SELECT
    match_day,
    rating_floor,
    count(*) as matches,
    max(completed_at) as last_played,
    now_ts
  FROM rated_matches
  GROUP BY match_day, rating_floor;

  INSERT INTO public.stats_daily_map_overview (
    match_day,
    rating_floor,
    map_identifier,
    map_name,
    matches,
    wins,
    losses,
    last_played,
    computed_at
  )
  WITH match_rows AS (
    SELECT
      tm.match_id,
      tm.completed_at,
      tm.map_identifier,
      tm.map_name,
      tem.min_human_rating,
      tem.has_null_rating
    FROM tmp_matches tm
    JOIN tmp_eligible_matches tem ON tem.match_id = tm.match_id
  ),
  match_results AS (
    SELECT
      date_trunc('day', mr.completed_at)::date as match_day,
      rf.rating_floor,
      mr.map_identifier,
      mr.map_name,
      mr.completed_at,
      case when bo.outcome = 'win' then 1 else 0 end as win_value,
      case when bo.outcome = 'loss' then 1 else 0 end as loss_value
    FROM match_rows mr
    JOIN tmp_baseline_outcomes bo ON bo.match_id = mr.match_id
    JOIN LATERAL (
      SELECT rp.rating_floor
      FROM tmp_rating_params rp
      WHERE rp.rating_floor = 0
        OR (mr.has_null_rating = false AND mr.min_human_rating IS NOT NULL AND mr.min_human_rating >= rp.rating_floor)
    ) rf ON true
  )
  SELECT
    match_day,
    rating_floor,
    map_identifier,
    min(map_name) as map_name,
    count(*) as matches,
    sum(win_value) as wins,
    sum(loss_value) as losses,
    max(completed_at) as last_played,
    now_ts
  FROM match_results
  GROUP BY match_day, rating_floor, map_identifier;

  INSERT INTO public.stats_daily_map_race_breakdown (
    match_day,
    rating_floor,
    map_identifier,
    race_id,
    matches,
    wins,
    losses,
    last_played,
    computed_at
  )
  WITH rating_rows AS (
    SELECT
      date_trunc('day', hp.completed_at)::date as match_day,
      rf.rating_floor,
      hp.map_identifier,
      hp.race_id,
      hp.outcome,
      hp.completed_at
    FROM tmp_human_participants hp
    JOIN LATERAL (
      SELECT rp.rating_floor
      FROM tmp_rating_params rp
      WHERE rp.rating_floor = 0
        OR (hp.has_null_rating = false AND hp.min_human_rating IS NOT NULL AND hp.min_human_rating >= rp.rating_floor)
    ) rf ON true
  )
  SELECT
    match_day,
    rating_floor,
    map_identifier,
    race_id,
    count(*) as matches,
    count(*) filter (where outcome = 'win') as wins,
    count(*) filter (where outcome = 'loss') as losses,
    max(completed_at) as last_played,
    now_ts
  FROM rating_rows
  GROUP BY match_day, rating_floor, map_identifier, race_id;

  INSERT INTO public.stats_daily_map_race_matchups (
    match_day,
    rating_floor,
    map_identifier,
    my_race_id,
    opponent_race_id,
    matches,
    wins,
    losses,
    last_played,
    computed_at
  )
  WITH participants_in_scope AS (
    SELECT
      hp.map_identifier,
      hp.match_id,
      hp.team_id,
      hp.race_id,
      hp.outcome,
      hp.completed_at,
      hp.min_human_rating,
      hp.has_null_rating
    FROM tmp_human_participants hp
  ),
  rating_rows AS (
    SELECT
      date_trunc('day', my.completed_at)::date as match_day,
      rf.rating_floor,
      my.map_identifier,
      my.match_id,
      my.team_id,
      my.race_id,
      my.outcome,
      my.completed_at
    FROM participants_in_scope my
    JOIN LATERAL (
      SELECT rp.rating_floor
      FROM tmp_rating_params rp
      WHERE rp.rating_floor = 0
        OR (my.has_null_rating = false AND my.min_human_rating IS NOT NULL AND my.min_human_rating >= rp.rating_floor)
    ) rf ON true
  )
  SELECT
    my.match_day,
    my.rating_floor,
    my.map_identifier,
    my.race_id as my_race_id,
    opp.race_id as opponent_race_id,
    count(*) as matches,
    count(*) filter (where my.outcome = 'win') as wins,
    count(*) filter (where my.outcome = 'loss') as losses,
    max(my.completed_at) as last_played,
    now_ts
  FROM rating_rows my
  JOIN participants_in_scope opp
    ON opp.match_id = my.match_id
   AND opp.team_id <> my.team_id
  GROUP BY my.match_day, my.rating_floor, my.map_identifier, my.race_id, opp.race_id;

  INSERT INTO public.stats_daily_matchup_matrix (
    match_day,
    rating_floor,
    my_race_id,
    opponent_race_id,
    matches,
    wins,
    losses,
    last_played,
    computed_at
  )
  WITH participants_in_scope AS (
    SELECT
      hp.match_id,
      hp.team_id,
      hp.race_id,
      hp.outcome,
      hp.completed_at,
      hp.min_human_rating,
      hp.has_null_rating
    FROM tmp_human_participants hp
  ),
  rating_rows AS (
    SELECT
      date_trunc('day', my.completed_at)::date as match_day,
      rf.rating_floor,
      my.match_id,
      my.team_id,
      my.race_id,
      my.outcome,
      my.completed_at
    FROM participants_in_scope my
    JOIN LATERAL (
      SELECT rp.rating_floor
      FROM tmp_rating_params rp
      WHERE rp.rating_floor = 0
        OR (my.has_null_rating = false AND my.min_human_rating IS NOT NULL AND my.min_human_rating >= rp.rating_floor)
    ) rf ON true
  )
  SELECT
    my.match_day,
    my.rating_floor,
    my.race_id as my_race_id,
    opp.race_id as opponent_race_id,
    count(*) as matches,
    count(*) filter (where my.outcome = 'win') as wins,
    count(*) filter (where my.outcome = 'loss') as losses,
    max(my.completed_at) as last_played,
    now_ts
  FROM rating_rows my
  JOIN participants_in_scope opp
    ON opp.match_id = my.match_id
   AND opp.team_id <> my.team_id
  GROUP BY my.match_day, my.rating_floor, my.race_id, opp.race_id;

  INSERT INTO public.stats_daily_race_pickrate (
    match_day,
    rating_floor,
    race_id,
    pick_count,
    match_count,
    computed_at
  )
  WITH rating_participants AS (
    SELECT
      date_trunc('day', hp.completed_at)::date as match_day,
      rf.rating_floor,
      hp.match_id,
      hp.race_id
    FROM tmp_human_participants hp
    JOIN LATERAL (
      SELECT rp.rating_floor
      FROM tmp_rating_params rp
      WHERE rp.rating_floor = 0
        OR (hp.has_null_rating = false AND hp.min_human_rating IS NOT NULL AND hp.min_human_rating >= rp.rating_floor)
    ) rf ON true
  ),
  match_counts AS (
    SELECT
      match_day,
      rating_floor,
      count(distinct match_id) as match_count
    FROM rating_participants
    GROUP BY match_day, rating_floor
  ),
  pick_counts AS (
    SELECT
      match_day,
      rating_floor,
      race_id,
      count(*) as pick_count
    FROM rating_participants
    GROUP BY match_day, rating_floor, race_id
  )
  SELECT
    pc.match_day,
    pc.rating_floor,
    pc.race_id,
    pc.pick_count,
    mc.match_count,
    now_ts
  FROM pick_counts pc
  JOIN match_counts mc
    ON mc.match_day = pc.match_day
   AND mc.rating_floor = pc.rating_floor;
END;
$$;

CREATE OR REPLACE FUNCTION public.stats_refresh_global_from_daily()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = 0
AS $$
DECLARE
  now_ts timestamptz := clock_timestamp();
  map_windows constant integer[] := array[30, 90];
  matchup_windows constant integer[] := array[30, 90];
  pickrate_weeks constant integer := 26;
BEGIN
  TRUNCATE TABLE public.stats_map_overview;
  TRUNCATE TABLE public.stats_map_race_breakdown;
  TRUNCATE TABLE public.stats_matchup_matrix;
  TRUNCATE TABLE public.stats_race_pickrate;
  TRUNCATE TABLE public.stats_map_race_matchups;

  DELETE FROM public.stats_summary
  WHERE metric = 'total_1v1_matches';

  INSERT INTO public.stats_summary (metric, rating_floor, value, computed_at)
  SELECT
    'total_1v1_matches',
    rating_floor,
    coalesce(sum(matches), 0),
    now_ts
  FROM public.stats_daily_summary
  GROUP BY rating_floor;

  INSERT INTO public.stats_map_overview (
    window_days,
    rating_floor,
    map_identifier,
    map_name,
    matches,
    wins,
    losses,
    winrate,
    last_played,
    computed_at
  )
  WITH window_params as (
    SELECT unnest(map_windows) as window_days
  ),
  aggregated as (
    SELECT
      wp.window_days,
      dmo.rating_floor,
      dmo.map_identifier,
      min(dmo.map_name) as map_name,
      sum(dmo.matches) as matches,
      sum(dmo.wins) as wins,
      sum(dmo.losses) as losses,
      max(dmo.last_played) as last_played
    FROM window_params wp
    JOIN public.stats_daily_map_overview dmo
      ON dmo.match_day >= (now_ts::date - (wp.window_days - 1))
    GROUP BY wp.window_days, dmo.rating_floor, dmo.map_identifier
  ),
  ranked as (
    SELECT
      *,
      row_number() over (
        partition by window_days, rating_floor
        order by matches desc, last_played desc nulls last
      ) as row_rank
    FROM aggregated
  )
  SELECT
    window_days,
    rating_floor,
    map_identifier,
    map_name,
    matches,
    wins,
    losses,
    case when matches > 0 then wins::numeric / matches::numeric else null end as winrate,
    last_played,
    now_ts
  FROM ranked
  WHERE row_rank <= 60;

  INSERT INTO public.stats_map_race_breakdown (
    window_days,
    rating_floor,
    map_identifier,
    race_id,
    matches,
    wins,
    losses,
    winrate,
    last_played,
    computed_at
  )
  WITH window_params as (
    SELECT unnest(map_windows) as window_days
  )
  SELECT
    wp.window_days,
    dmr.rating_floor,
    dmr.map_identifier,
    dmr.race_id,
    sum(dmr.matches) as matches,
    sum(dmr.wins) as wins,
    sum(dmr.losses) as losses,
    case when sum(dmr.matches) > 0
         then sum(dmr.wins)::numeric / sum(dmr.matches)::numeric
         else null
    end as winrate,
    max(dmr.last_played) as last_played,
    now_ts
  FROM window_params wp
  JOIN public.stats_daily_map_race_breakdown dmr
    ON dmr.match_day >= (now_ts::date - (wp.window_days - 1))
  GROUP BY wp.window_days, dmr.rating_floor, dmr.map_identifier, dmr.race_id;

  INSERT INTO public.stats_map_race_matchups (
    window_days,
    rating_floor,
    map_identifier,
    my_race_id,
    opponent_race_id,
    matches,
    wins,
    losses,
    winrate,
    last_played,
    computed_at
  )
  WITH window_params as (
    SELECT unnest(map_windows) as window_days
  )
  SELECT
    wp.window_days,
    dmm.rating_floor,
    dmm.map_identifier,
    dmm.my_race_id,
    dmm.opponent_race_id,
    sum(dmm.matches) as matches,
    sum(dmm.wins) as wins,
    sum(dmm.losses) as losses,
    case when sum(dmm.matches) > 0
         then sum(dmm.wins)::numeric / sum(dmm.matches)::numeric
         else null
    end as winrate,
    max(dmm.last_played) as last_played,
    now_ts
  FROM window_params wp
  JOIN public.stats_daily_map_race_matchups dmm
    ON dmm.match_day >= (now_ts::date - (wp.window_days - 1))
  GROUP BY wp.window_days, dmm.rating_floor, dmm.map_identifier, dmm.my_race_id, dmm.opponent_race_id;

  INSERT INTO public.stats_matchup_matrix (
    window_days,
    rating_floor,
    my_race_id,
    opponent_race_id,
    matches,
    wins,
    losses,
    winrate,
    last_played,
    computed_at
  )
  WITH window_params as (
    SELECT unnest(matchup_windows) as window_days
  )
  SELECT
    wp.window_days,
    dmm.rating_floor,
    dmm.my_race_id,
    dmm.opponent_race_id,
    sum(dmm.matches) as matches,
    sum(dmm.wins) as wins,
    sum(dmm.losses) as losses,
    case when sum(dmm.matches) > 0
         then sum(dmm.wins)::numeric / sum(dmm.matches)::numeric
         else null
    end as winrate,
    max(dmm.last_played) as last_played,
    now_ts
  FROM window_params wp
  JOIN public.stats_daily_matchup_matrix dmm
    ON dmm.match_day >= (now_ts::date - (wp.window_days - 1))
  GROUP BY wp.window_days, dmm.rating_floor, dmm.my_race_id, dmm.opponent_race_id;

  INSERT INTO public.stats_race_pickrate (
    week_start,
    rating_floor,
    race_id,
    pick_count,
    match_count,
    computed_at
  )
  WITH params as (
    SELECT
      date_trunc('week', now_ts - make_interval(weeks => pickrate_weeks))::date as min_week_start
  ),
  weekly_matches as (
    SELECT
      date_trunc('week', match_day)::date as week_start,
      rating_floor,
      sum(matches) as match_count
    FROM public.stats_daily_summary
    CROSS JOIN params p
    WHERE match_day >= p.min_week_start
    GROUP BY week_start, rating_floor
  ),
  weekly_picks as (
    SELECT
      date_trunc('week', match_day)::date as week_start,
      rating_floor,
      race_id,
      sum(pick_count) as pick_count
    FROM public.stats_daily_race_pickrate
    CROSS JOIN params p
    WHERE match_day >= p.min_week_start
    GROUP BY week_start, rating_floor, race_id
  )
  SELECT
    wp.week_start,
    wp.rating_floor,
    wp.race_id,
    wp.pick_count,
    wm.match_count,
    now_ts
  FROM weekly_picks wp
  JOIN weekly_matches wm
    ON wm.week_start = wp.week_start
   AND wm.rating_floor = wp.rating_floor;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_match_history(
  p_keep_days integer DEFAULT 7
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  keep_days integer := greatest(coalesce(p_keep_days, 7), 1);
BEGIN
  DELETE FROM public.matches
  WHERE completed_at IS NOT NULL
    AND completed_at < (now() - make_interval(days => keep_days));
END;
$$;
