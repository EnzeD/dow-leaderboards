-- Optimize stats aggregation functions to avoid repeated subqueries and leverage pre-filtered match sets.

create or replace function public.stats_get_map_overview(
  p_since timestamptz default (now() - interval '90 days'),
  p_limit integer default 30
)
returns table (
  map_identifier text,
  map_name text,
  matches integer,
  wins integer,
  losses integer,
  winrate numeric,
  last_played timestamptz
)
language sql
security definer
set search_path = public
as $$
  with params as (
    select
      coalesce(p_since, now() - interval '90 days') as since_value,
      greatest(5, least(coalesce(p_limit, 30), 100)) as limit_value
  ),
  matches_in_scope as (
    select
      m.match_id,
      coalesce(nullif(trim(m.map_name), ''), 'unknown') as map_identifier,
      coalesce(nullif(m.map_name, ''), 'Unknown Map') as map_name,
      m.completed_at
    from public.matches m
    cross join params p
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= p.since_value
  ),
  eligible_match_ids as (
    select
      mp.match_id
    from public.match_participants mp
    join matches_in_scope mis on mis.match_id = mp.match_id
    group by mp.match_id
    having
      count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
      and count(*) filter (where mp.is_computer = true) = 0
  ),
  eligible_matches as (
    select
      mis.match_id,
      mis.map_identifier,
      mis.map_name,
      mis.completed_at
    from matches_in_scope mis
    join eligible_match_ids em on em.match_id = mis.match_id
  ),
  baseline_outcomes as (
    select distinct on (mp.match_id)
      mp.match_id,
      mp.outcome
    from public.match_participants mp
    join eligible_match_ids em on em.match_id = mp.match_id
    where mp.is_computer = false
      and mp.team_id is not null
    order by mp.match_id, mp.team_id
  )
  select
    em.map_identifier,
    min(em.map_name) as map_name,
    count(*) as matches,
    sum(case when bo.outcome = 'win' then 1 else 0 end) as wins,
    sum(case when bo.outcome = 'loss' then 1 else 0 end) as losses,
    case when count(*) > 0
         then sum(case when bo.outcome = 'win' then 1 else 0 end)::numeric / count(*)::numeric
         else null
    end as winrate,
    max(em.completed_at) as last_played
  from eligible_matches em
  join baseline_outcomes bo on bo.match_id = em.match_id
  group by em.map_identifier
  order by matches desc, last_played desc nulls last
  limit (select limit_value from params);
$$;

comment on function public.stats_get_map_overview is
  'Returns aggregated 1v1 map performance, using the lower team_id participant as the baseline outcome.';

create or replace function public.stats_get_map_race_breakdown(
  p_map_identifier text,
  p_since timestamptz default (now() - interval '90 days')
)
returns table (
  map_identifier text,
  race_id smallint,
  matches integer,
  wins integer,
  losses integer,
  winrate numeric,
  last_played timestamptz
)
language sql
security definer
set search_path = public
as $$
  with params as (
    select
      coalesce(nullif(trim(p_map_identifier), ''), 'unknown') as target_map,
      coalesce(p_since, now() - interval '90 days') as since_value
  ),
  matches_in_scope as (
    select
      m.match_id,
      coalesce(nullif(trim(m.map_name), ''), 'unknown') as map_identifier,
      m.completed_at
    from public.matches m
    cross join params p
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= p.since_value
      and coalesce(nullif(trim(m.map_name), ''), 'unknown') = p.target_map
  ),
  eligible_match_ids as (
    select
      mp.match_id
    from public.match_participants mp
    join matches_in_scope mis on mis.match_id = mp.match_id
    group by mp.match_id
    having
      count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
      and count(*) filter (where mp.is_computer = true) = 0
  ),
  eligible_participants as (
    select
      mp.match_id,
      mp.race_id,
      mp.outcome,
      mis.completed_at
    from public.match_participants mp
    join matches_in_scope mis on mis.match_id = mp.match_id
    join eligible_match_ids em on em.match_id = mp.match_id
    where mp.is_computer = false
      and mp.team_id is not null
      and mp.race_id is not null
  )
  select
    p.target_map as map_identifier,
    ep.race_id,
    count(*) as matches,
    count(*) filter (where ep.outcome = 'win') as wins,
    count(*) filter (where ep.outcome = 'loss') as losses,
    case when count(*) > 0
         then (count(*) filter (where ep.outcome = 'win'))::numeric / count(*)::numeric
         else null
    end as winrate,
    max(ep.completed_at) as last_played
  from eligible_participants ep
  cross join params p
  group by p.target_map, ep.race_id
  order by matches desc, wins desc, ep.race_id;
$$;

comment on function public.stats_get_map_race_breakdown is
  'Returns per-race win/loss totals for a specific map within the 1v1 human-only dataset.';

create or replace function public.stats_get_race_pickrate(
  p_since timestamptz default (now() - interval '90 days'),
  p_weeks integer default 12
)
returns table (
  week_start date,
  race_id smallint,
  pick_count integer,
  match_count integer
)
language sql
security definer
set search_path = public
as $$
  with params as (
    select
      greatest(1, least(coalesce(p_weeks, 12), 52)) as weeks_limit,
      coalesce(p_since, now() - interval '90 days') as since_value
  ),
  matches_in_scope as (
    select
      m.match_id,
      date_trunc('week', m.completed_at)::date as week_start,
      m.completed_at
    from public.matches m
    cross join params p
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= greatest(p.since_value, now() - make_interval(weeks => p.weeks_limit))
  ),
  eligible_match_ids as (
    select
      mp.match_id
    from public.match_participants mp
    join matches_in_scope mis on mis.match_id = mp.match_id
    group by mp.match_id
    having
      count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
      and count(*) filter (where mp.is_computer = true) = 0
  ),
  eligible_participants as (
    select
      mp.match_id,
      mp.race_id,
      mis.week_start
    from public.match_participants mp
    join matches_in_scope mis on mis.match_id = mp.match_id
    join eligible_match_ids em on em.match_id = mp.match_id
    where mp.is_computer = false
      and mp.team_id is not null
      and mp.race_id is not null
  ),
  matches_per_week as (
    select
      mis.week_start,
      count(distinct mis.match_id) as match_count
    from matches_in_scope mis
    join eligible_match_ids em on em.match_id = mis.match_id
    group by mis.week_start
  )
  select
    ep.week_start,
    ep.race_id,
    count(*) as pick_count,
    mpw.match_count
  from eligible_participants ep
  join matches_per_week mpw
    on mpw.week_start = ep.week_start
  group by ep.week_start, ep.race_id, mpw.match_count
  order by ep.week_start asc, ep.race_id asc;
$$;

comment on function public.stats_get_race_pickrate is
  'Returns weekly 1v1 faction pick counts and total matches for the selected window.';

create or replace function public.stats_get_matchup_matrix(
  p_since timestamptz default (now() - interval '90 days')
)
returns table (
  my_race_id smallint,
  opponent_race_id smallint,
  matches integer,
  wins integer,
  losses integer,
  winrate numeric,
  last_played timestamptz
)
language sql
security definer
set search_path = public
as $$
  with params as (
    select coalesce(p_since, now() - interval '90 days') as since_value
  ),
  matches_in_scope as (
    select
      m.match_id,
      m.completed_at
    from public.matches m
    cross join params p
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= p.since_value
  ),
  eligible_match_ids as (
    select
      mp.match_id
    from public.match_participants mp
    join matches_in_scope mis on mis.match_id = mp.match_id
    group by mp.match_id
    having
      count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
      and count(*) filter (where mp.is_computer = true) = 0
  ),
  eligible_participants as (
    select
      mp.match_id,
      mp.team_id,
      mp.race_id,
      mp.outcome,
      mis.completed_at
    from public.match_participants mp
    join matches_in_scope mis on mis.match_id = mp.match_id
    join eligible_match_ids em on em.match_id = mp.match_id
    where mp.is_computer = false
      and mp.team_id is not null
      and mp.race_id is not null
  )
  select
    my.race_id as my_race_id,
    opp.race_id as opponent_race_id,
    count(*) as matches,
    count(*) filter (where my.outcome = 'win') as wins,
    count(*) filter (where my.outcome = 'loss') as losses,
    case when count(*) > 0
         then (count(*) filter (where my.outcome = 'win'))::numeric / count(*)::numeric
         else null
    end as winrate,
    max(my.completed_at) as last_played
  from eligible_participants my
  join eligible_participants opp
    on opp.match_id = my.match_id
   and opp.team_id <> my.team_id
  group by my.race_id, opp.race_id
  order by my.race_id, opp.race_id;
$$;

comment on function public.stats_get_matchup_matrix is
  'Returns a 1v1 faction-versus-faction matrix aggregated across all human matches in the window.';

create table if not exists public.stats_map_overview (
  window_days integer not null,
  map_identifier text not null,
  map_name text not null,
  matches integer not null,
  wins integer not null,
  losses integer not null,
  winrate numeric,
  last_played timestamptz,
  computed_at timestamptz not null default now(),
  constraint stats_map_overview_pkey primary key (window_days, map_identifier)
);

create index if not exists stats_map_overview_matches_idx
  on public.stats_map_overview (window_days, matches desc);

alter table public.stats_map_overview enable row level security;
create policy stats_map_overview_read on public.stats_map_overview
  for select using (true);

create table if not exists public.stats_map_race_breakdown (
  window_days integer not null,
  map_identifier text not null,
  race_id smallint not null,
  matches integer not null,
  wins integer not null,
  losses integer not null,
  winrate numeric,
  last_played timestamptz,
  computed_at timestamptz not null default now(),
  constraint stats_map_race_breakdown_pkey primary key (window_days, map_identifier, race_id)
);

create index if not exists stats_map_race_breakdown_matches_idx
  on public.stats_map_race_breakdown (window_days, map_identifier, matches desc);

alter table public.stats_map_race_breakdown enable row level security;
create policy stats_map_race_breakdown_read on public.stats_map_race_breakdown
  for select using (true);

create table if not exists public.stats_matchup_matrix (
  window_days integer not null,
  my_race_id smallint not null,
  opponent_race_id smallint not null,
  matches integer not null,
  wins integer not null,
  losses integer not null,
  winrate numeric,
  last_played timestamptz,
  computed_at timestamptz not null default now(),
  constraint stats_matchup_matrix_pkey primary key (window_days, my_race_id, opponent_race_id)
);

create index if not exists stats_matchup_matrix_matches_idx
  on public.stats_matchup_matrix (window_days, my_race_id, matches desc);

alter table public.stats_matchup_matrix enable row level security;
create policy stats_matchup_matrix_read on public.stats_matchup_matrix
  for select using (true);

create table if not exists public.stats_race_pickrate (
  week_start date not null,
  race_id smallint not null,
  pick_count integer not null,
  match_count integer not null,
  computed_at timestamptz not null default now(),
  constraint stats_race_pickrate_pkey primary key (week_start, race_id)
);

create index if not exists stats_race_pickrate_week_idx
  on public.stats_race_pickrate (week_start desc);

alter table public.stats_race_pickrate enable row level security;
create policy stats_race_pickrate_read on public.stats_race_pickrate
  for select using (true);

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
  max_map_window integer;
  max_matchup_window integer;
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

  truncate table public.stats_map_overview;
  truncate table public.stats_map_race_breakdown;
  truncate table public.stats_matchup_matrix;
  truncate table public.stats_race_pickrate;

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
  base_matches as (
    select
      m.match_id,
      coalesce(nullif(trim(m.map_name), ''), 'unknown') as map_identifier,
      coalesce(nullif(m.map_name, ''), 'Unknown Map') as map_name,
      m.completed_at
    from public.matches m
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= now_ts - make_interval(days => max_map_window)
  ),
  eligible_match_ids as (
    select
      mp.match_id
    from public.match_participants mp
    join base_matches bm on bm.match_id = mp.match_id
    group by mp.match_id
    having
      count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
      and count(*) filter (where mp.is_computer = true) = 0
  ),
  baseline_outcomes as (
    select distinct on (mp.match_id)
      mp.match_id,
      mp.outcome
    from public.match_participants mp
    join eligible_match_ids em on em.match_id = mp.match_id
    where mp.is_computer = false
      and mp.team_id is not null
    order by mp.match_id, mp.team_id
  ),
  match_results as (
    select
      bm.map_identifier,
      bm.map_name,
      bm.completed_at,
      case when bo.outcome = 'win' then 1 else 0 end as win_value,
      case when bo.outcome = 'loss' then 1 else 0 end as loss_value
    from base_matches bm
    join eligible_match_ids em on em.match_id = bm.match_id
    join baseline_outcomes bo on bo.match_id = bm.match_id
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
  base_matches as (
    select
      m.match_id,
      coalesce(nullif(trim(m.map_name), ''), 'unknown') as map_identifier,
      m.completed_at
    from public.matches m
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= now_ts - make_interval(days => max_map_window)
  ),
  eligible_match_ids as (
    select
      mp.match_id
    from public.match_participants mp
    join base_matches bm on bm.match_id = mp.match_id
    group by mp.match_id
    having
      count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
      and count(*) filter (where mp.is_computer = true) = 0
  ),
  eligible_participants as (
    select
      bm.map_identifier,
      mp.race_id,
      mp.outcome,
      bm.completed_at
    from base_matches bm
    join eligible_match_ids em on em.match_id = bm.match_id
    join public.match_participants mp on mp.match_id = bm.match_id
    where mp.is_computer = false
      and mp.team_id is not null
      and mp.race_id is not null
  )
  select
    wp.window_days,
    ep.map_identifier,
    ep.race_id,
    count(*) as matches,
    count(*) filter (where ep.outcome = 'win') as wins,
    count(*) filter (where ep.outcome = 'loss') as losses,
    case when count(*) > 0 then (count(*) filter (where ep.outcome = 'win'))::numeric / count(*)::numeric else null end as winrate,
    max(ep.completed_at) as last_played,
    now_ts
  from window_params wp
  join eligible_participants ep
    on ep.completed_at >= now_ts - make_interval(days => wp.window_days)
  group by wp.window_days, ep.map_identifier, ep.race_id;

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
  base_matches as (
    select
      m.match_id,
      m.completed_at
    from public.matches m
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= now_ts - make_interval(days => max_matchup_window)
  ),
  eligible_match_ids as (
    select
      mp.match_id
    from public.match_participants mp
    join base_matches bm on bm.match_id = mp.match_id
    group by mp.match_id
    having
      count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
      and count(*) filter (where mp.is_computer = true) = 0
  ),
  eligible_participants as (
    select
      mp.match_id,
      mp.team_id,
      mp.race_id,
      mp.outcome,
      bm.completed_at
    from base_matches bm
    join eligible_match_ids em on em.match_id = bm.match_id
    join public.match_participants mp on mp.match_id = bm.match_id
    where mp.is_computer = false
      and mp.team_id is not null
      and mp.race_id is not null
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
  join eligible_participants my
    on my.completed_at >= now_ts - make_interval(days => wp.window_days)
  join eligible_participants opp
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
      date_trunc('week', now_ts - make_interval(weeks => 26))::date as min_week_start,
      now_ts - make_interval(weeks => 26) as since_ts
  ),
  matches_in_scope as (
    select
      m.match_id,
      date_trunc('week', m.completed_at)::date as week_start,
      m.completed_at
    from public.matches m
    cross join params p
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= p.since_ts
  ),
  eligible_match_ids as (
    select
      mp.match_id
    from public.match_participants mp
    join matches_in_scope mis on mis.match_id = mp.match_id
    group by mp.match_id
    having
      count(*) filter (where mp.is_computer = false and mp.team_id is not null) = 2
      and count(*) filter (where mp.is_computer = true) = 0
  ),
  eligible_participants as (
    select
      mis.week_start,
      mp.race_id,
      mp.match_id
    from matches_in_scope mis
    join eligible_match_ids em on em.match_id = mis.match_id
    join public.match_participants mp on mp.match_id = mis.match_id
    where mp.is_computer = false
      and mp.team_id is not null
      and mp.race_id is not null
  ),
  matches_per_week as (
    select
      mis.week_start,
      count(distinct mis.match_id) as match_count
    from matches_in_scope mis
    join eligible_match_ids em on em.match_id = mis.match_id
    group by mis.week_start
  )
  select
    ep.week_start,
    ep.race_id,
    count(*) as pick_count,
    mpw.match_count,
    now_ts
  from eligible_participants ep
  join matches_per_week mpw
    on mpw.week_start = ep.week_start
  cross join params p
  where ep.week_start >= p.min_week_start
  group by ep.week_start, ep.race_id, mpw.match_count;
end;
$$;

comment on function public.stats_refresh_global is
  'Refreshes pre-aggregated global stats tables used by the public Stats tab.';
