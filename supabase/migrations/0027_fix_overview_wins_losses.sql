-- Fix premium_get_profile_overview to get wins/losses from actual leaderboard data
-- The player_leaderboard_stats table is for snapshots only, not current data

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
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id_str text := p_profile_id::text;
  v_total_matches bigint;
  v_matches_last_7_days bigint;
  v_total_wins bigint := 0;
  v_total_losses bigint := 0;
  v_winrate numeric;
  v_last_xp_sync timestamptz;
begin
  -- Get match counts from match_participants
  select
    count(*),
    count(*) filter (where m.completed_at >= (now() - interval '7 days'))
  into v_total_matches, v_matches_last_7_days
  from public.match_participants mp
  join public.matches m on m.match_id = mp.match_id
  where mp.profile_id = p_profile_id
    and mp.is_computer = false;

  -- Get wins/losses from current leaderboard standings
  -- Sum across all leaderboards the player appears in
  select
    coalesce(sum(wins), 0)::bigint,
    coalesce(sum(losses), 0)::bigint
  into v_total_wins, v_total_losses
  from public.leaderboard_standings
  where profile_id = v_profile_id_str;

  -- Calculate winrate
  if (v_total_wins + v_total_losses) > 0 then
    v_winrate := v_total_wins::numeric / (v_total_wins + v_total_losses)::numeric;
  else
    v_winrate := null;
  end if;

  -- Get last XP sync timestamp
  select
    greatest(
      coalesce(last_seen_at, '-infinity'::timestamptz),
      coalesce(updated_at, '-infinity'::timestamptz)
    )
  into v_last_xp_sync
  from public.players
  where players.profile_id = p_profile_id;

  return query select
    p_profile_id,
    v_total_matches,
    v_matches_last_7_days,
    v_total_wins,
    v_total_losses,
    v_winrate,
    v_last_xp_sync;
end;
$$;

comment on function public.premium_get_profile_overview is
  'Returns overview stats for a player profile including total matches, recent activity, and leaderboard win/loss records from current standings.';
