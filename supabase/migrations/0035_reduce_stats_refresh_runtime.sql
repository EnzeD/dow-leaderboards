-- Recompute stats_refresh_global without per-window duplicated scans.

create or replace function public.stats_refresh_global()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = 0
as $$
declare
  now_ts timestamptz := clock_timestamp();
  map_windows constant integer[] := array[30, 90];
  matchup_windows constant integer[] := array[30, 90];
  pickrate_weeks constant integer := 26;
  max_map_window integer;
  max_matchup_window integer;
  max_base_window integer;
begin
  select coalesce(max(w.window_days), 90)
    into max_map_window
  from unnest(map_windows) as w(window_days);

  if max_map_window < 1 then
    max_map_window := 90;
  end if;

  select coalesce(max(w.window_days), max_map_window)
    into max_matchup_window
  from unnest(matchup_windows) as w(window_days);

  if max_matchup_window < 1 then
    max_matchup_window := max_map_window;
  end if;

  max_base_window := greatest(
    max_map_window,
    max_matchup_window,
    pickrate_weeks * 7
  );

  truncate table public.stats_map_overview;
  truncate table public.stats_map_race_breakdown;
  truncate table public.stats_matchup_matrix;
  truncate table public.stats_race_pickrate;

  create temporary table tmp_matches
  on commit drop as
  select
    m.match_id,
    coalesce(nullif(trim(m.map_name), ''), 'unknown') as map_identifier,
    coalesce(nullif(m.map_name, ''), 'Unknown Map') as map_name,
    m.completed_at
  from public.matches m
  where m.match_type_id = 1
    and m.completed_at is not null
    and m.completed_at >= now_ts - make_interval(days => max_base_window);

  create index on tmp_matches (completed_at desc);
  create index on tmp_matches (map_identifier, completed_at desc);

  create temporary table tmp_participants
  on commit drop as
  select
    mp.match_id,
    mp.team_id,
    mp.race_id,
    mp.outcome,
    mp.is_computer,
    tm.completed_at,
    tm.map_identifier,
    tm.map_name
  from public.match_participants mp
  join tmp_matches tm on tm.match_id = mp.match_id;

  create index on tmp_participants (match_id);
  create index on tmp_participants (map_identifier, completed_at desc);
  create index on tmp_participants (race_id) where is_computer = false and race_id is not null;

  create temporary table tmp_eligible_matches
  on commit drop as
  select
    match_id
  from tmp_participants
  group by match_id
  having
    count(*) filter (where is_computer = false and team_id is not null) = 2
    and count(*) filter (where is_computer = true) = 0;

  create index on tmp_eligible_matches (match_id);

  create temporary table tmp_human_participants
  on commit drop as
  select
    tp.match_id,
    tp.team_id,
    tp.race_id,
    tp.outcome,
    tp.completed_at,
    tp.map_identifier,
    tp.map_name
  from tmp_participants tp
  join tmp_eligible_matches tem on tem.match_id = tp.match_id
  where tp.is_computer = false
    and tp.team_id is not null;

  create index on tmp_human_participants (match_id);
  create index on tmp_human_participants (completed_at desc);
  create index on tmp_human_participants (map_identifier, completed_at desc);
  create index on tmp_human_participants (race_id) where race_id is not null;

  create temporary table tmp_baseline_outcomes
  on commit drop as
  select distinct on (hp.match_id)
    hp.match_id,
    hp.outcome
  from tmp_human_participants hp
  order by hp.match_id, hp.team_id;

  create index on tmp_baseline_outcomes (match_id);

  insert into public.stats_map_overview (
    window_days,
    map_identifier,
    map_name,
    matches,
    wins,
    losses,
    winrate,
    last_played,
    computed_at
  )
  with window_params as (
    select unnest(map_windows) as window_days
  ),
  match_results as (
    select
      tm.map_identifier,
      tm.map_name,
      tm.completed_at,
      case when bo.outcome = 'win' then 1 else 0 end as win_value,
      case when bo.outcome = 'loss' then 1 else 0 end as loss_value
    from tmp_matches tm
    join tmp_eligible_matches tem on tem.match_id = tm.match_id
    join tmp_baseline_outcomes bo on bo.match_id = tm.match_id
  ),
  aggregated as (
    select
      wp.window_days,
      mr.map_identifier,
      min(mr.map_name) as map_name,
      count(*) as matches,
      sum(mr.win_value) as wins,
      sum(mr.loss_value) as losses,
      max(mr.completed_at) as last_played
    from window_params wp
    join match_results mr
      on mr.completed_at >= now_ts - make_interval(days => wp.window_days)
    group by wp.window_days, mr.map_identifier
  ),
  ranked as (
    select
      *,
      row_number() over (
        partition by window_days
        order by matches desc, last_played desc nulls last
      ) as row_rank
    from aggregated
  )
  select
    window_days,
    map_identifier,
    map_name,
    matches,
    wins,
    losses,
    case when matches > 0 then wins::numeric / matches::numeric else null end as winrate,
    last_played,
    now_ts
  from ranked
  where row_rank <= 60;

  insert into public.stats_map_race_breakdown (
    window_days,
    map_identifier,
    race_id,
    matches,
    wins,
    losses,
    winrate,
    last_played,
    computed_at
  )
  with window_params as (
    select unnest(map_windows) as window_days
  ),
  participants_in_scope as (
    select
      hp.map_identifier,
      hp.race_id,
      hp.outcome,
      hp.completed_at
    from tmp_human_participants hp
    where hp.race_id is not null
  )
  select
    wp.window_days,
    pis.map_identifier,
    pis.race_id,
    count(*) as matches,
    count(*) filter (where pis.outcome = 'win') as wins,
    count(*) filter (where pis.outcome = 'loss') as losses,
    case when count(*) > 0 then (count(*) filter (where pis.outcome = 'win'))::numeric / count(*)::numeric else null end as winrate,
    max(pis.completed_at) as last_played,
    now_ts
  from window_params wp
  join participants_in_scope pis
    on pis.completed_at >= now_ts - make_interval(days => wp.window_days)
  group by wp.window_days, pis.map_identifier, pis.race_id;

  insert into public.stats_matchup_matrix (
    window_days,
    my_race_id,
    opponent_race_id,
    matches,
    wins,
    losses,
    winrate,
    last_played,
    computed_at
  )
  with window_params as (
    select unnest(matchup_windows) as window_days
  ),
  participants_in_scope as (
    select
      hp.match_id,
      hp.team_id,
      hp.race_id,
      hp.outcome,
      hp.completed_at
    from tmp_human_participants hp
    where hp.race_id is not null
  )
  select
    wp.window_days,
    my.race_id as my_race_id,
    opp.race_id as opponent_race_id,
    count(*) as matches,
    count(*) filter (where my.outcome = 'win') as wins,
    count(*) filter (where my.outcome = 'loss') as losses,
    case when count(*) > 0 then (count(*) filter (where my.outcome = 'win'))::numeric / count(*)::numeric else null end as winrate,
    max(my.completed_at) as last_played,
    now_ts
  from window_params wp
  join participants_in_scope my
    on my.completed_at >= now_ts - make_interval(days => wp.window_days)
  join participants_in_scope opp
    on opp.match_id = my.match_id
   and opp.team_id <> my.team_id
  group by wp.window_days, my.race_id, opp.race_id;

  insert into public.stats_race_pickrate (
    week_start,
    race_id,
    pick_count,
    match_count,
    computed_at
  )
  with params as (
    select
      date_trunc('week', now_ts - make_interval(weeks => pickrate_weeks))::date as min_week_start,
      now_ts - make_interval(weeks => pickrate_weeks) as since_ts
  ),
  participants_in_scope as (
    select
      hp.match_id,
      hp.race_id,
      date_trunc('week', hp.completed_at)::date as week_start,
      hp.completed_at
    from tmp_human_participants hp
    cross join params p
    where hp.completed_at >= p.since_ts
      and hp.race_id is not null
  ),
  matches_per_week as (
    select
      pis.week_start,
      count(distinct pis.match_id) as match_count
    from participants_in_scope pis
    group by pis.week_start
  )
  select
    pis.week_start,
    pis.race_id,
    count(*) as pick_count,
    mpw.match_count,
    now_ts
  from participants_in_scope pis
  join matches_per_week mpw
    on mpw.week_start = pis.week_start
  cross join params p
  where pis.week_start >= p.min_week_start
  group by pis.week_start, pis.race_id, mpw.match_count;
end;
$$;

comment on function public.stats_refresh_global is
  'Refreshes pre-aggregated global stats tables used by the public Stats tab.';
