-- Global statistics helpers powering the public Stats tab.
-- Provides map aggregates, per-map race breakdowns, race pick rates, and matchup matrices.

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
  filtered_matches as (
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
      and (select count(*) from public.match_participants mp
           where mp.match_id = m.match_id
             and mp.is_computer = false
             and mp.team_id is not null) = 2
      and not exists (
        select 1 from public.match_participants mp
        where mp.match_id = m.match_id
          and mp.is_computer = true
      )
  ),
  baselines as (
    select
      fm.match_id,
      fm.map_identifier,
      fm.map_name,
      fm.completed_at,
      min(mtr.team_id) as baseline_team_id
    from filtered_matches fm
    join public.match_team_results mtr on mtr.match_id = fm.match_id
    group by fm.match_id, fm.map_identifier, fm.map_name, fm.completed_at
  ),
  results as (
    select
      b.map_identifier,
      b.map_name,
      b.completed_at,
      (mtr.outcome = 'win')::int as baseline_win
    from baselines b
    join public.match_team_results mtr
      on mtr.match_id = b.match_id
     and mtr.team_id = b.baseline_team_id
  )
  select
    r.map_identifier,
    min(r.map_name) as map_name,
    count(*) as matches,
    sum(r.baseline_win) as wins,
    count(*) - sum(r.baseline_win) as losses,
    case when count(*) > 0
         then sum(r.baseline_win)::numeric / count(*)::numeric
         else null
    end as winrate,
    max(r.completed_at) as last_played
  from results r
  group by r.map_identifier
  order by matches desc, last_played desc nulls last
  limit (select limit_value from params);
$$;

comment on function public.stats_get_map_overview is
  'Returns aggregated 1v1 map performance, using baseline team (lowest team_id) win rate as the top-level metric.';

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
  filtered_matches as (
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
      and (select count(*) from public.match_participants mp
           where mp.match_id = m.match_id
             and mp.is_computer = false
             and mp.team_id is not null) = 2
      and not exists (
        select 1 from public.match_participants mp
        where mp.match_id = m.match_id
          and mp.is_computer = true
      )
  ),
  participants as (
    select
      fm.map_identifier,
      mp.race_id,
      mp.outcome,
      fm.completed_at
    from filtered_matches fm
    join public.match_participants mp
      on mp.match_id = fm.match_id
    where mp.is_computer = false
      and mp.team_id is not null
      and mp.race_id is not null
  )
  select
    p.target_map as map_identifier,
    participants.race_id,
    count(*) as matches,
    count(*) filter (where participants.outcome = 'win') as wins,
    count(*) filter (where participants.outcome = 'loss') as losses,
    case when count(*) > 0
         then (count(*) filter (where participants.outcome = 'win'))::numeric / count(*)::numeric
         else null
    end as winrate,
    max(participants.completed_at) as last_played
  from participants
  cross join params p
  group by p.target_map, participants.race_id
  order by matches desc, wins desc, participants.race_id;
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
  bounds as (
    select
      date_trunc('week', greatest(p.since_value, now() - make_interval(weeks => p.weeks_limit)))::date as window_start
    from params p
  ),
  base as (
    select
      date_trunc('week', m.completed_at)::date as week_start,
      mp.race_id,
      m.match_id
    from public.matches m
    join public.match_participants mp
      on mp.match_id = m.match_id
    cross join bounds b
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= b.window_start
      and mp.is_computer = false
      and mp.team_id is not null
      and mp.race_id is not null
      and (select count(*) from public.match_participants mp2
           where mp2.match_id = m.match_id
             and mp2.is_computer = false
             and mp2.team_id is not null) = 2
      and not exists (
        select 1 from public.match_participants mp3
        where mp3.match_id = m.match_id
          and mp3.is_computer = true
      )
  ),
  matches_per_week as (
    select
      week_start,
      count(distinct match_id) as match_count
    from base
    group by week_start
  )
  select
    b.week_start,
    b.race_id,
    count(*) as pick_count,
    mpw.match_count
  from base b
  join matches_per_week mpw
    on mpw.week_start = b.week_start
  group by b.week_start, b.race_id, mpw.match_count
  order by b.week_start asc, b.race_id asc;
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
  filtered_matches as (
    select
      m.match_id,
      m.completed_at
    from public.matches m
    cross join params p
    where m.match_type_id = 1
      and m.completed_at is not null
      and m.completed_at >= p.since_value
      and (select count(*) from public.match_participants mp
           where mp.match_id = m.match_id
             and mp.is_computer = false
             and mp.team_id is not null) = 2
      and not exists (
        select 1 from public.match_participants mp
        where mp.match_id = m.match_id
          and mp.is_computer = true
      )
  ),
  base as (
    select
      my.race_id as my_race_id,
      opp.race_id as opponent_race_id,
      my.outcome,
      fm.completed_at
    from filtered_matches fm
    join public.match_participants my
      on my.match_id = fm.match_id
    join public.match_participants opp
      on opp.match_id = my.match_id
     and opp.team_id <> my.team_id
    where my.is_computer = false
      and opp.is_computer = false
      and my.team_id is not null
      and opp.team_id is not null
      and my.race_id is not null
      and opp.race_id is not null
  )
  select
    b.my_race_id,
    b.opponent_race_id,
    count(*) as matches,
    count(*) filter (where b.outcome = 'win') as wins,
    count(*) filter (where b.outcome = 'loss') as losses,
    case when count(*) > 0
         then (count(*) filter (where b.outcome = 'win'))::numeric / count(*)::numeric
         else null
    end as winrate,
    max(b.completed_at) as last_played
  from base b
  group by b.my_race_id, b.opponent_race_id
  order by b.my_race_id, b.opponent_race_id;
$$;

comment on function public.stats_get_matchup_matrix is
  'Returns a 1v1 faction-versus-faction matrix aggregated across all human matches in the window.';

-- Supporting indexes for faster lookups.
create index if not exists matches_1v1_map_key_completed_idx
  on public.matches (
    coalesce(nullif(trim(map_name), ''), 'unknown'),
    completed_at desc
  )
  where match_type_id = 1
    and completed_at is not null;

create index if not exists match_participants_human_match_idx
  on public.match_participants (match_id)
  where is_computer = false
    and team_id is not null;

create index if not exists match_participants_human_race_idx
  on public.match_participants (race_id, match_id)
  where is_computer = false
    and team_id is not null
    and race_id is not null;
