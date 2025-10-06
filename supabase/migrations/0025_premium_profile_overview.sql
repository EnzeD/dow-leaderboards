-- Profile overview metrics for premium analytics panels
-- TODO: replace last_xp_sync with premium crawl timestamp when dedicated job tracking is available

create or replace function public.premium_get_profile_overview(
  p_profile_id bigint
)
returns table (
  profile_id bigint,
  total_matches bigint,
  matches_last_7_days bigint,
  total_wins bigint,
  total_losses bigint,
  winrate numeric,
  last_xp_sync timestamptz
)
language sql
security definer
set search_path = public
as $$
  with match_base as (
    select
      mp.match_id,
      mp.outcome,
      m.completed_at
    from public.match_participants mp
    join public.matches m on m.match_id = mp.match_id
    where mp.profile_id = p_profile_id
      and mp.is_computer = false
  ),
  leaderboard_totals as (
    select
      coalesce(sum(ls.wins), 0)::bigint as wins,
      coalesce(sum(ls.losses), 0)::bigint as losses
    from (
      select distinct on (leaderboard_id)
        wins,
        losses
      from public.player_leaderboard_stats
      where profile_id = p_profile_id
      order by leaderboard_id, snapshot_at desc
    ) as ls
  ),
  player_meta as (
    select
      profile_id,
      greatest(
        coalesce(last_seen_at, '-infinity'::timestamptz),
        coalesce(updated_at, '-infinity'::timestamptz)
      ) as last_xp_sync
    from public.players
    where profile_id = p_profile_id
  )
  select
    p_profile_id as profile_id,
    (select count(*) from match_base)::bigint as total_matches,
    (
      select count(*)
      from match_base
      where completed_at >= (now() - interval '7 days')
    )::bigint as matches_last_7_days,
    leaderboard_totals.wins as total_wins,
    leaderboard_totals.losses as total_losses,
    case
      when (leaderboard_totals.wins + leaderboard_totals.losses) > 0 then
        leaderboard_totals.wins::numeric / (leaderboard_totals.wins + leaderboard_totals.losses)::numeric
      else null
    end as winrate,
    (select last_xp_sync from player_meta limit 1) as last_xp_sync
  from leaderboard_totals;
$$;
