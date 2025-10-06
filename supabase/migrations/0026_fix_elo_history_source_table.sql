-- Fix premium_get_elo_history to use leaderboard_rank_history instead of player_leaderboard_stats
-- The actual snapshot data is in leaderboard_rank_history, not player_leaderboard_stats

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
    lrh.captured_at as snapshot_at,
    lrh.leaderboard_id,
    lrh.rating,
    lrh.rank,
    null::integer as rank_total
  from public.leaderboard_rank_history as lrh
  where lrh.profile_id = p_profile_id::text
    and (p_leaderboard_id is null or lrh.leaderboard_id = p_leaderboard_id)
    and (p_since is null or lrh.captured_at >= p_since)
  order by lrh.captured_at asc, lrh.leaderboard_id asc
  limit greatest(10, least(coalesce(p_limit, 200), 1000));
$$;

comment on function public.premium_get_elo_history is
  'Returns rating snapshots for a profile from leaderboard_rank_history, filtered by leaderboard and optional time window.';
