-- Add rating-based filtering support to global stats aggregates.

alter table public.stats_map_overview
  add column if not exists rating_floor integer not null default 0;

alter table public.stats_map_overview
  drop constraint if exists stats_map_overview_pkey;

alter table public.stats_map_overview
  add constraint stats_map_overview_pkey primary key (window_days, rating_floor, map_identifier);

drop index if exists stats_map_overview_matches_idx;
create index if not exists stats_map_overview_matches_idx
  on public.stats_map_overview (window_days, rating_floor, matches desc);

alter table public.stats_map_race_breakdown
  add column if not exists rating_floor integer not null default 0;

alter table public.stats_map_race_breakdown
  drop constraint if exists stats_map_race_breakdown_pkey;

alter table public.stats_map_race_breakdown
  add constraint stats_map_race_breakdown_pkey primary key (window_days, rating_floor, map_identifier, race_id);

drop index if exists stats_map_race_breakdown_matches_idx;
create index if not exists stats_map_race_breakdown_matches_idx
  on public.stats_map_race_breakdown (window_days, rating_floor, map_identifier, matches desc);

alter table public.stats_map_race_matchups
  add column if not exists rating_floor integer not null default 0;

alter table public.stats_map_race_matchups
  drop constraint if exists stats_map_race_matchups_pkey;

alter table public.stats_map_race_matchups
  add constraint stats_map_race_matchups_pkey primary key (window_days, rating_floor, map_identifier, my_race_id, opponent_race_id);

drop index if exists stats_map_race_matchups_matches_idx;
create index if not exists stats_map_race_matchups_matches_idx
  on public.stats_map_race_matchups (window_days, rating_floor, map_identifier, my_race_id, matches desc);

alter table public.stats_matchup_matrix
  add column if not exists rating_floor integer not null default 0;

alter table public.stats_matchup_matrix
  drop constraint if exists stats_matchup_matrix_pkey;

alter table public.stats_matchup_matrix
  add constraint stats_matchup_matrix_pkey primary key (window_days, rating_floor, my_race_id, opponent_race_id);

alter table public.stats_race_pickrate
  add column if not exists rating_floor integer not null default 0;

alter table public.stats_race_pickrate
  drop constraint if exists stats_race_pickrate_pkey;

alter table public.stats_race_pickrate
  add constraint stats_race_pickrate_pkey primary key (week_start, rating_floor, race_id);

drop index if exists stats_race_pickrate_week_idx;
create index if not exists stats_race_pickrate_week_idx
  on public.stats_race_pickrate (rating_floor, week_start desc);

alter table public.stats_summary
  add column if not exists rating_floor integer not null default 0;

alter table public.stats_summary
  drop constraint if exists stats_summary_pkey;

alter table public.stats_summary
  add constraint stats_summary_pkey primary key (metric, rating_floor);

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
  rating_thresholds constant integer[] := array[0, 1200, 1400];
  max_map_window integer;
  max_matchup_window integer;
  max_base_window integer;
  prev_min_computed timestamptz;
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
  truncate table public.stats_map_race_matchups;

  create temporary table tmp_prev_summary
  on commit drop as
  select
    rating_floor,
    value,
    computed_at
  from public.stats_summary
  where metric = 'total_1v1_matches';

  select min(computed_at)
    into prev_min_computed
  from tmp_prev_summary
  where computed_at is not null;

  delete from public.stats_summary
  where metric = 'total_1v1_matches';

  create temporary table tmp_rating_params (rating_floor integer not null)
  on commit drop;

  insert into tmp_rating_params (rating_floor)
  select unnest(rating_thresholds);

  if exists (
    select 1
    from tmp_rating_params rp
    left join tmp_prev_summary prev on prev.rating_floor = rp.rating_floor
    where prev.rating_floor is null
  ) then
    prev_min_computed := null;
  end if;

  create temporary table tmp_delta_matches
  on commit drop as
  select
    m.match_id,
    m.completed_at,
    min(case when mp.is_computer = false and mp.new_rating is not null then mp.new_rating end) as min_human_rating,
    bool_or(mp.is_computer = false and mp.new_rating is null) as has_null_rating
  from public.matches m
  join public.match_participants mp on mp.match_id = m.match_id
  where m.match_type_id = 1
    and m.completed_at is not null
    and (prev_min_computed is null or m.completed_at > prev_min_computed)
  group by m.match_id, m.completed_at
  having
    count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
    and count(*) filter (where mp.is_computer = true) = 0;

  create index on tmp_delta_matches (completed_at);
  create index on tmp_delta_matches (min_human_rating);

  insert into public.stats_summary (metric, rating_floor, value, computed_at)
  select
    'total_1v1_matches',
    rp.rating_floor,
    coalesce(prev.value, 0) + coalesce(delta.delta_count, 0),
    now_ts
  from tmp_rating_params rp
  left join tmp_prev_summary prev on prev.rating_floor = rp.rating_floor
  left join (
    select
      rp_inner.rating_floor,
      count(*) as delta_count
    from tmp_rating_params rp_inner
    left join tmp_prev_summary prev_inner on prev_inner.rating_floor = rp_inner.rating_floor
    join tmp_delta_matches dm
      on (
        rp_inner.rating_floor = 0
        or (
          dm.has_null_rating = false
          and dm.min_human_rating is not null
          and dm.min_human_rating >= rp_inner.rating_floor
        )
      )
     and dm.completed_at > coalesce(prev_inner.computed_at, '-infinity'::timestamptz)
    group by rp_inner.rating_floor
  ) delta on delta.rating_floor = rp.rating_floor;

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
    mp.new_rating,
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
    match_id,
    min(case when is_computer = false and new_rating is not null then new_rating end) as min_human_rating,
    bool_or(is_computer = false and new_rating is null) as has_null_rating
  from tmp_participants
  group by match_id
  having
    count(*) filter (where is_computer = false and team_id is not null) = 2
    and count(*) filter (where is_computer = true) = 0;

  create index on tmp_eligible_matches (match_id);
  create index on tmp_eligible_matches (min_human_rating);

  create temporary table tmp_human_participants
  on commit drop as
  select
    tp.match_id,
    tp.team_id,
    tp.race_id,
    tp.outcome,
    tp.completed_at,
    tp.map_identifier,
    tp.map_name,
    tp.new_rating,
    tem.min_human_rating,
    tem.has_null_rating
  from tmp_participants tp
  join tmp_eligible_matches tem on tem.match_id = tp.match_id
  where tp.is_computer = false
    and tp.team_id is not null
    and tp.race_id is not null;

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
  with window_params as (
    select unnest(map_windows) as window_days
  ),
  match_results as (
    select
      tm.map_identifier,
      tm.map_name,
      tm.completed_at,
      rf.rating_floor,
      case when bo.outcome = 'win' then 1 else 0 end as win_value,
      case when bo.outcome = 'loss' then 1 else 0 end as loss_value
    from tmp_matches tm
    join tmp_eligible_matches tem on tem.match_id = tm.match_id
    join tmp_baseline_outcomes bo on bo.match_id = tm.match_id
    join lateral (
      select rp.rating_floor
      from tmp_rating_params rp
      where rp.rating_floor = 0
        or (tem.has_null_rating = false and tem.min_human_rating is not null and tem.min_human_rating >= rp.rating_floor)
    ) rf on true
  ),
  aggregated as (
    select
      wp.window_days,
      mr.rating_floor,
      mr.map_identifier,
      min(mr.map_name) as map_name,
      count(*) as matches,
      sum(mr.win_value) as wins,
      sum(mr.loss_value) as losses,
      max(mr.completed_at) as last_played
    from window_params wp
    join match_results mr
      on mr.completed_at >= now_ts - make_interval(days => wp.window_days)
    group by wp.window_days, mr.rating_floor, mr.map_identifier
  ),
  ranked as (
    select
      *,
      row_number() over (
        partition by window_days, rating_floor
        order by matches desc, last_played desc nulls last
      ) as row_rank
    from aggregated
  )
  select
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
  from ranked
  where row_rank <= 60;

  insert into public.stats_map_race_breakdown (
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
  with window_params as (
    select unnest(map_windows) as window_days
  ),
  rating_rows as (
    select
      wp.window_days,
      rf.rating_floor,
      hp.map_identifier,
      hp.race_id,
      hp.outcome,
      hp.completed_at
    from window_params wp
    join tmp_human_participants hp
      on hp.completed_at >= now_ts - make_interval(days => wp.window_days)
    join lateral (
      select rp.rating_floor
      from tmp_rating_params rp
      where rp.rating_floor = 0
        or (hp.has_null_rating = false and hp.min_human_rating is not null and hp.min_human_rating >= rp.rating_floor)
    ) rf on true
  )
  select
    window_days,
    rating_floor,
    map_identifier,
    race_id,
    count(*) as matches,
    count(*) filter (where outcome = 'win') as wins,
    count(*) filter (where outcome = 'loss') as losses,
    case when count(*) > 0
         then (count(*) filter (where outcome = 'win'))::numeric / count(*)::numeric
         else null
    end as winrate,
    max(completed_at) as last_played,
    now_ts
  from rating_rows
  group by window_days, rating_floor, map_identifier, race_id;

  insert into public.stats_map_race_matchups (
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
  with window_params as (
    select unnest(map_windows) as window_days
  ),
  participants_in_scope as (
    select
      hp.map_identifier,
      hp.match_id,
      hp.team_id,
      hp.race_id,
      hp.outcome,
      hp.completed_at,
      hp.min_human_rating,
      hp.has_null_rating
    from tmp_human_participants hp
  ),
  rating_rows as (
    select
      wp.window_days,
      rf.rating_floor,
      my.map_identifier,
      my.match_id,
      my.team_id,
      my.race_id,
      my.outcome,
      my.completed_at
    from window_params wp
    join participants_in_scope my
      on my.completed_at >= now_ts - make_interval(days => wp.window_days)
    join lateral (
      select rp.rating_floor
      from tmp_rating_params rp
      where rp.rating_floor = 0
        or (my.has_null_rating = false and my.min_human_rating is not null and my.min_human_rating >= rp.rating_floor)
    ) rf on true
  )
  select
    window_days,
    rating_floor,
    my.map_identifier as map_identifier,
    my.race_id as my_race_id,
    opp.race_id as opponent_race_id,
    count(*) as matches,
    count(*) filter (where my.outcome = 'win') as wins,
    count(*) filter (where my.outcome = 'loss') as losses,
    case when count(*) > 0
         then (count(*) filter (where my.outcome = 'win'))::numeric / count(*)::numeric
         else null
    end as winrate,
    max(my.completed_at) as last_played,
    now_ts
  from rating_rows my
  join participants_in_scope opp
    on opp.match_id = my.match_id
   and opp.team_id <> my.team_id
  group by window_days, rating_floor, my.map_identifier, my.race_id, opp.race_id;

  insert into public.stats_matchup_matrix (
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
  with window_params as (
    select unnest(matchup_windows) as window_days
  ),
  participants_in_scope as (
    select
      hp.match_id,
      hp.team_id,
      hp.race_id,
      hp.outcome,
      hp.completed_at,
      hp.min_human_rating,
      hp.has_null_rating
    from tmp_human_participants hp
  ),
  rating_rows as (
    select
      wp.window_days,
      rf.rating_floor,
      my.match_id,
      my.team_id,
      my.race_id,
      my.outcome,
      my.completed_at
    from window_params wp
    join participants_in_scope my
      on my.completed_at >= now_ts - make_interval(days => wp.window_days)
    join lateral (
      select rp.rating_floor
      from tmp_rating_params rp
      where rp.rating_floor = 0
        or (my.has_null_rating = false and my.min_human_rating is not null and my.min_human_rating >= rp.rating_floor)
    ) rf on true
  )
  select
    window_days,
    rating_floor,
    my.race_id as my_race_id,
    opp.race_id as opponent_race_id,
    count(*) as matches,
    count(*) filter (where my.outcome = 'win') as wins,
    count(*) filter (where my.outcome = 'loss') as losses,
    case when count(*) > 0
         then (count(*) filter (where my.outcome = 'win'))::numeric / count(*)::numeric
         else null
    end as winrate,
    max(my.completed_at) as last_played,
    now_ts
  from rating_rows my
  join participants_in_scope opp
    on opp.match_id = my.match_id
   and opp.team_id <> my.team_id
  group by window_days, rating_floor, my.race_id, opp.race_id;

  insert into public.stats_race_pickrate (
    week_start,
    rating_floor,
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
      hp.completed_at,
      hp.min_human_rating,
      hp.has_null_rating
    from tmp_human_participants hp
    cross join params p
    where hp.completed_at >= p.since_ts
      and hp.race_id is not null
  ),
  rating_participants as (
    select
      rp.rating_floor,
      pis.match_id,
      pis.race_id,
      pis.week_start
    from participants_in_scope pis
    join lateral (
      select rp.rating_floor
      from tmp_rating_params rp
      where rp.rating_floor = 0
        or (pis.has_null_rating = false and pis.min_human_rating is not null and pis.min_human_rating >= rp.rating_floor)
    ) rp on true
  ),
  matches_per_week as (
    select
      rating_floor,
      week_start,
      count(distinct match_id) as match_count
    from rating_participants
    group by rating_floor, week_start
  ),
  pick_counts as (
    select
      rating_floor,
      week_start,
      race_id,
      count(*) as pick_count
    from rating_participants
    group by rating_floor, week_start, race_id
  )
  select
    pc.week_start,
    pc.rating_floor,
    pc.race_id,
    pc.pick_count,
    mpw.match_count,
    now_ts
  from pick_counts pc
  join matches_per_week mpw
    on mpw.rating_floor = pc.rating_floor
   and mpw.week_start = pc.week_start
  cross join params p
  where pc.week_start >= p.min_week_start;
end;
$$;
