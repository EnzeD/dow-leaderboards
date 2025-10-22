-- Add helper function to fetch per-opponent race breakdown for a specific map.

create or replace function public.stats_get_map_race_matchups(
  p_map_identifier text,
  p_race_id smallint,
  p_since timestamptz default (now() - interval '90 days')
)
returns table (
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
    select
      coalesce(nullif(trim(p_map_identifier), ''), 'unknown') as target_map,
      p_race_id as target_race,
      coalesce(p_since, now() - interval '90 days') as since_value
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
  ),
  my_participants as (
    select
      ep.match_id,
      ep.team_id,
      ep.race_id,
      ep.outcome,
      ep.completed_at
    from eligible_participants ep
    join params p on true
    where p.target_race is not null
      and ep.race_id = p.target_race
  )
  select
    opp.race_id as opponent_race_id,
    count(*) as matches,
    count(*) filter (where my.outcome = 'win') as wins,
    count(*) filter (where my.outcome = 'loss') as losses,
    case when count(*) > 0
         then (count(*) filter (where my.outcome = 'win'))::numeric / count(*)::numeric
         else null
    end as winrate,
    max(my.completed_at) as last_played
  from my_participants my
  join eligible_participants opp
    on opp.match_id = my.match_id
   and opp.team_id <> my.team_id
  group by opp.race_id
  order by matches desc, last_played desc nulls last;
$$;

comment on function public.stats_get_map_race_matchups is
  'Returns opponent race breakdown for the given map identifier and player race within the 1v1 human-only dataset.';
