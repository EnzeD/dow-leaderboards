import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

export async function getLatestRankMap(leaderboardId: number): Promise<Map<string, number>> {
  if (!supabaseAdmin) return new Map();

  const { data: latest, error: latestError } = await supabaseAdmin
    .from("leaderboard_rank_history")
    .select("captured_at")
    .eq("leaderboard_id", leaderboardId)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError || !latest?.captured_at) {
    if (latestError) console.warn("Rank history lookup failed", latestError);
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from("leaderboard_rank_history")
    .select("profile_id, rank")
    .eq("leaderboard_id", leaderboardId)
    .eq("captured_at", latest.captured_at)
    .limit(2000);

  if (error || !data) {
    if (error) console.warn("Rank history rows fetch failed", error);
    return new Map();
  }

  return new Map(data.map(row => [row.profile_id, row.rank]));
}
