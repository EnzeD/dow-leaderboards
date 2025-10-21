drop function if exists public.premium_get_opponent_stats(
  p_profile_id bigint,
  p_since timestamptz,
  p_match_type_id integer,
  p_limit integer
);

create or replace function public.premium_get_opponent_stats(
  p_profile_id bigint,
  p_since timestamptz default (now() - interval '90 days'),
  p_match_type_id integer default null,
  p_limit integer default 10
)
returns table (
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
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      opp.profile_id as opponent_profile_id,
      coalesce(opp_player.current_alias, nullif(opp.alias_at_match, ''), opp.profile_id::text) as opponent_alias,
      my.outcome,
      opp_player.country as opponent_country,
      opp.race_id as opponent_race_id,
      m.completed_at
    from public.match_participants my
    join public.match_participants opp
      on opp.match_id = my.match_id
     and opp.team_id <> my.team_id
    join public.matches m on m.match_id = my.match_id
    left join public.players opp_player on opp_player.profile_id = opp.profile_id
    where my.profile_id = p_profile_id
      and my.is_computer = false
      and my.team_id is not null
      and my.outcome in ('win', 'loss')
      and opp.is_computer = false
      and opp.team_id is not null
      and opp.outcome in ('win', 'loss')
      and opp.profile_id is not null
      and (p_since is null or m.completed_at >= p_since)
      and (
        p_match_type_id is null
        or (p_match_type_id >= 0 and m.match_type_id = p_match_type_id)
        or (p_match_type_id = -1 and m.match_type_id in (1, 2, 3, 4))
        or (p_match_type_id = -2 and (m.match_type_id is null or m.match_type_id not in (1, 2, 3, 4)))
      )
  )
  select
    b.opponent_profile_id,
    b.opponent_alias,
    max(b.opponent_country) as opponent_country,
    mode() within group (order by b.opponent_race_id) as opponent_main_race_id,
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
  'Returns the most frequent opponents for a player with win/loss records plus country/race metadata. Filters support match_type_id = -1 (automatch) and -2 (custom).';

drop function if exists public.premium_get_opponent_match_history(
  p_profile_id bigint,
  p_opponent_profile_id bigint,
  p_since timestamptz,
  p_match_type_id integer,
  p_limit integer
);

create or replace function public.premium_get_opponent_match_history(
  p_profile_id bigint,
  p_opponent_profile_id bigint,
  p_since timestamptz default (now() - interval '90 days'),
  p_match_type_id integer default null,
  p_limit integer default 20
)
returns table (
  match_id bigint,
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
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      m.match_id,
      m.map_name,
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
    from public.match_participants my
    join public.match_participants opp
      on opp.match_id = my.match_id
     and opp.profile_id = p_opponent_profile_id
     and opp.team_id is not null
     and my.team_id is not null
     and opp.team_id <> my.team_id
    join public.matches m
      on m.match_id = my.match_id
    where my.profile_id = p_profile_id
      and my.is_computer = false
      and my.team_id is not null
      and my.outcome in ('win', 'loss')
      and opp.is_computer = false
      and opp.team_id is not null
      and opp.outcome in ('win', 'loss')
      and (p_since is null or m.completed_at >= p_since)
      and (
        p_match_type_id is null
        or (p_match_type_id >= 0 and m.match_type_id = p_match_type_id)
        or (p_match_type_id = -1 and m.match_type_id in (1, 2, 3, 4))
        or (p_match_type_id = -2 and (m.match_type_id is null or m.match_type_id not in (1, 2, 3, 4)))
      )
  )
  select
    b.match_id,
    b.map_name,
    b.match_type_id,
    b.started_at,
    b.completed_at,
    b.duration_seconds,
    coalesce(nullif(b.outcome::text, ''), 'unknown') as outcome,
    b.old_rating,
    b.new_rating,
    b.rating_delta,
    b.team_id,
    b.race_id,
    (
      select jsonb_agg(jsonb_build_object(
        'profileId', mp.profile_id::text,
        'alias', coalesce(player.current_alias, nullif(mp.alias_at_match, ''), mp.profile_id::text),
        'teamId', mp.team_id,
        'raceId', mp.race_id,
        'oldRating', mp.old_rating,
        'newRating', mp.new_rating
      ) order by mp.team_id, mp.profile_id)
      from public.match_participants mp
      left join public.players player on player.profile_id = mp.profile_id
      where mp.match_id = b.match_id
        and mp.is_computer = false
        and mp.team_id is not null
    ) as players
  from base b
  order by b.completed_at desc nulls last
  limit greatest(5, least(coalesce(p_limit, 50), 100));
$$;

comment on function public.premium_get_opponent_match_history is
  'Returns recent matches between a player and a specific opponent, including roster details.';

drop function if exists public.premium_get_map_match_history(
  p_profile_id bigint,
  p_map_identifier text,
  p_since timestamptz,
  p_match_type_id integer,
  p_limit integer
);

create or replace function public.premium_get_map_match_history(
  p_profile_id bigint,
  p_map_identifier text,
  p_since timestamptz default (now() - interval '90 days'),
  p_match_type_id integer default null,
  p_limit integer default 20
)
returns table (
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
language sql
security definer
set search_path = public
as $$
  with base as (
    select
      m.match_id,
      coalesce(nullif(trim(m.map_name), ''), 'unknown') as map_identifier,
      coalesce(nullif(m.map_name, ''), 'Unknown Map') as map_name,
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
    from public.match_participants my
    join public.matches m on m.match_id = my.match_id
    where my.profile_id = p_profile_id
      and my.is_computer = false
      and my.team_id is not null
      and my.outcome in ('win', 'loss')
      and (p_since is null or m.completed_at >= p_since)
      and (
        p_match_type_id is null
        or (p_match_type_id >= 0 and m.match_type_id = p_match_type_id)
        or (p_match_type_id = -1 and m.match_type_id in (1, 2, 3, 4))
        or (p_match_type_id = -2 and (m.match_type_id is null or m.match_type_id not in (1, 2, 3, 4)))
      )
  ), filtered as (
    select *
    from base
    where map_identifier = coalesce(nullif(trim(p_map_identifier), ''), 'unknown')
  )
  select
    f.match_id,
    f.map_identifier,
    f.map_name,
    f.match_type_id,
    f.started_at,
    f.completed_at,
    f.duration_seconds,
    coalesce(nullif(f.outcome::text, ''), 'unknown') as outcome,
    f.old_rating,
    f.new_rating,
    f.rating_delta,
    f.team_id,
    f.race_id,
    (
      select jsonb_agg(jsonb_build_object(
        'profileId', mp.profile_id::text,
        'alias', coalesce(player.current_alias, nullif(mp.alias_at_match, ''), mp.profile_id::text),
        'teamId', mp.team_id,
        'raceId', mp.race_id,
        'oldRating', mp.old_rating,
        'newRating', mp.new_rating
      ) order by mp.team_id, mp.profile_id)
      from public.match_participants mp
      left join public.players player on player.profile_id = mp.profile_id
      where mp.match_id = f.match_id
        and mp.is_computer = false
        and mp.team_id is not null
    ) as players
  from filtered f
  order by f.completed_at desc nulls last
  limit greatest(5, least(coalesce(p_limit, 50), 100));
$$;

comment on function public.premium_get_map_match_history is
  'Returns recent matches for a given map, including roster metadata and player outcomes.';
