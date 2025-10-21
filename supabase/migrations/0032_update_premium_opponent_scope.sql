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
  'Returns the most frequent opponents for a player with win/loss records. Filters support match_type_id = -1 (automatch) and -2 (custom).';
