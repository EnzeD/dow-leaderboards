-- Ensure premium_get_elo_history returns the most recent snapshots per leaderboard.
-- Previously, the function ordered snapshots ascending before applying the limit,
-- which truncated the newest rows when more than the limit existed in the window,
-- especially when fetching all ladders simultaneously.

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
  with ranked_history as (
    select
      lrh.captured_at as snapshot_at,
      lrh.leaderboard_id,
      lrh.rating,
      lrh.rank,
      null::integer as rank_total,
      row_number() over (
        partition by lrh.leaderboard_id
        order by lrh.captured_at desc
      ) as rn
    from public.leaderboard_rank_history as lrh
    where lrh.profile_id = p_profile_id::text
      and (p_leaderboard_id is null or lrh.leaderboard_id = p_leaderboard_id)
      and (p_since is null or lrh.captured_at >= p_since)
  )
  select
    snapshot_at,
    leaderboard_id,
    rating,
    rank,
    rank_total
  from ranked_history
  where rn <= greatest(10, least(coalesce(p_limit, 200), 1000))
  order by snapshot_at asc, leaderboard_id asc;
$$;

comment on function public.premium_get_elo_history is
  'Returns rating snapshots for a profile from leaderboard_rank_history, filtered by leaderboard and optional time window.';
