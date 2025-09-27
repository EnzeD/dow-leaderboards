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

  const { data: previous, error: previousError } = await supabaseAdmin
    .from("leaderboard_rank_history")
    .select("captured_at")
    .eq("leaderboard_id", leaderboardId)
    .lt("captured_at", latest.captured_at)
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (previousError || !previous?.captured_at) {
    if (previousError) console.warn("Previous rank history lookup failed", previousError);
    return new Map();
  }

  // Use the snapshot immediately preceding the latest one as our comparison baseline.
  const baselineCapturedAt = previous.captured_at;

  const { data, error } = await supabaseAdmin
    .from("leaderboard_rank_history")
    .select("profile_id, rank")
    .eq("leaderboard_id", leaderboardId)
    .eq("captured_at", baselineCapturedAt)
    .limit(2000);

  if (error || !data) {
    if (error) console.warn("Rank history rows fetch failed", error);
    return new Map();
  }

  return new Map(data.map(row => [row.profile_id, row.rank]));
}

export function buildCombinedMultiKey(row: any): string | null {
  if (!row) return null;
  const profileId = row.profileId ?? row.profile_id ?? row.profileID;
  if (!profileId) return null;
  const leaderboardId = row.leaderboardId ?? row.leaderboard_id;
  const faction = row.faction ?? row.Faction ?? row.race;
  const discriminator = leaderboardId ?? faction;
  return `${String(profileId)}:${discriminator ?? 'unknown'}`;
}

export async function getLatestCombinedMultiRankMap(): Promise<Map<string, number>> {
  if (!supabaseAdmin) return new Map();

  const { data, error } = await supabaseAdmin
    .from("leaderboard_history")
    .select("payload, captured_at")
    .eq("mode", "combined-1v1-multi")
    .order("captured_at", { ascending: false })
    .limit(2);

  if (error) {
    console.warn("Combined multi history lookup failed", error);
    return new Map();
  }

  if (!data || data.length < 2) {
    return new Map();
  }

  const baseline = data[1];
  const rows = Array.isArray((baseline as any)?.payload?.rows)
    ? (baseline as any).payload.rows
    : [];

  const map = new Map<string, number>();
  for (const row of rows) {
    const key = buildCombinedMultiKey(row);
    if (!key) continue;
    const rank = typeof row?.rank === "number" ? row.rank : null;
    if (rank === null) continue;
    map.set(key, rank);
  }

  return map;
}
