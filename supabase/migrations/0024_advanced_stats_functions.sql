-- Aggregation functions supporting premium advanced statistics
-- Provides time-series rating data, matchup winrates, map winrates, and frequent opponent performance

create or replace function public.premium_get_elo_history(
  p_profile_id bigint,
  p_leaderboard_id integer default null,
  p_since timestamptz default (now() - interval '90 days'),
  p_limit integer default 200
)
returns table (
  snapshot_at timestamptz,
  leaderboard_id integer,
  rating integer,
  rank integer,
  rank_total integer
)
language sql
security definer
set search_path = public
as $$
  select
    pls.snapshot_at,
    pls.leaderboard_id,
    pls.rating,
    pls.rank,
    pls.rank_total
  from public.player_leaderboard_stats as pls
  where pls.profile_id = p_profile_id
    and (p_leaderboard_id is null or pls.leaderboard_id = p_leaderboard_id)
    and (p_since is null or pls.snapshot_at >= p_since)
  order by pls.snapshot_at asc
  limit greatest(10, least(coalesce(p_limit, 200), 1000));
$$;

comment on function public.premium_get_elo_history is
  'Returns rating snapshots for a profile, filtered by leaderboard and optional time window.';

create or replace function public.premium_get_matchup_stats(
  p_profile_id bigint,
  p_since timestamptz default (now() - interval '90 days'),
  p_match_type_id integer default null
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
  with base as (
    select
      my.race_id as my_race_id,
      opp.race_id as opponent_race_id,
      my.outcome,
      m.completed_at
    from public.match_participants my
    join public.match_participants opp
      on opp.match_id = my.match_id
     and opp.team_id <> my.team_id
    join public.matches m
      on m.match_id = my.match_id
    where my.profile_id = p_profile_id
      and my.is_computer = false
      and opp.is_computer = false
      and (p_since is null or m.completed_at >= p_since)
      and (p_match_type_id is null or m.match_type_id = p_match_type_id)
  )
  select
    b.my_race_id,
    b.opponent_race_id,
    count(*) as matches,
    count(*) filter (where b.outcome = 'win') as wins,
    count(*) filter (where b.outcome = 'loss') as losses,
    case when count(*) > 0 then (count(*) filter (where b.outcome = 'win')::numeric / count(*)::numeric) else null end as winrate,
    max(b.completed_at) as last_played
  from base b
  group by 1,2
  order by matches desc, last_played desc nulls last;
$$;

comment on function public.premium_get_matchup_stats is
  'Aggregates wins and losses by faction matchup for a given player within a time window.';

create or replace function public.premium_get_map_stats(
  p_profile_id bigint,
  p_since timestamptz default (now() - interval '90 days'),
  p_match_type_id integer default null,
  p_limit integer default 50
)
returns table (
  map_identifier text,
  map_name text,
  match_type_id integer,
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
  with base as (
    select
      coalesce(nullif(trim(m.map_name), ''), 'unknown') as map_identifier,
      coalesce(nullif(m.map_name, ''), 'Unknown Map') as map_name,
      m.match_type_id,
      my.outcome,
      m.completed_at
    from public.match_participants my
    join public.matches m on m.match_id = my.match_id
    where my.profile_id = p_profile_id
      and my.is_computer = false
      and (p_since is null or m.completed_at >= p_since)
      and (p_match_type_id is null or m.match_type_id = p_match_type_id)
  )
  select
    b.map_identifier,
    b.map_name,
    b.match_type_id,
    count(*) as matches,
    count(*) filter (where b.outcome = 'win') as wins,
    count(*) filter (where b.outcome = 'loss') as losses,
    case when count(*) > 0 then (count(*) filter (where b.outcome = 'win')::numeric / count(*)::numeric) else null end as winrate,
    max(b.completed_at) as last_played
  from base b
  group by 1,2,3
  order by matches desc, last_played desc nulls last
  limit greatest(10, least(coalesce(p_limit, 50), 200));
$$;

comment on function public.premium_get_map_stats is
  'Returns per-map win/loss aggregates for a player, filtered by match type and time window.';

create or replace function public.premium_get_opponent_stats(
  p_profile_id bigint,
  p_since timestamptz default (now() - interval '90 days'),
  p_match_type_id integer default null,
  p_limit integer default 10
)
returns table (
  opponent_profile_id bigint,
  opponent_alias text,
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
  with base as (
    select
      opp.profile_id as opponent_profile_id,
      coalesce(opp_player.current_alias, nullif(opp.alias_at_match, ''), opp.profile_id::text) as opponent_alias,
      my.outcome,
      m.completed_at
    from public.match_participants my
    join public.match_participants opp
      on opp.match_id = my.match_id
     and opp.team_id <> my.team_id
    join public.matches m on m.match_id = my.match_id
    left join public.players opp_player on opp_player.profile_id = opp.profile_id
    where my.profile_id = p_profile_id
      and my.is_computer = false
      and opp.is_computer = false
      and opp.profile_id is not null
      and (p_since is null or m.completed_at >= p_since)
      and (p_match_type_id is null or m.match_type_id = p_match_type_id)
  )
  select
    b.opponent_profile_id,
    b.opponent_alias,
    count(*) as matches,
    count(*) filter (where b.outcome = 'win') as wins,
    count(*) filter (where b.outcome = 'loss') as losses,
    case when count(*) > 0 then (count(*) filter (where b.outcome = 'win')::numeric / count(*)::numeric) else null end as winrate,
    max(b.completed_at) as last_played
  from base b
  group by b.opponent_profile_id, b.opponent_alias
  order by matches desc, last_played desc nulls last
  limit greatest(5, least(coalesce(p_limit, 10), 50));
$$;

comment on function public.premium_get_opponent_stats is
  'Returns the most frequent opponents for a player with win/loss records.';

create index if not exists match_participants_match_team_idx
  on public.match_participants (match_id, team_id);

