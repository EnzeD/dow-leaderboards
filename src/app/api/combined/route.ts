import { fetchCombined1v1, resolveNames } from "@/lib/relic";
import { getLatestRankMap } from "@/lib/rank-history";
import { supabase } from "@/lib/supabase";
import { getLevelFromXP } from "@/lib/xp-levels";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await fetchCombined1v1();
    const missing = rows.filter(r => !r.playerName).map(r => r.profileId);
    const map = missing.length ? await resolveNames(missing) : {};
    for (const r of rows) r.playerName = r.playerName || map[r.profileId] || "Unknown";

    // Enhance with level data from our database
    const levelMap = new Map();
    try {
      // Convert profile IDs to numbers for database query (bigint column)
      const profileIds = rows.map(r => Number(r.profileId)).filter(id => !isNaN(id));

      if (profileIds.length === 0) {
        console.log('No valid profile IDs to query');
      } else {
        const { data: players, error } = await supabase
          .from('players')
          .select('profile_id, xp')
          .in('profile_id', profileIds);

        if (error) {
          console.error('Error fetching player levels:', error);
        } else if (players && players.length > 0) {
        players.forEach(player => {
          const level = getLevelFromXP(player.xp ?? undefined);
          levelMap.set(String(player.profile_id), level);
        });
        }
      }
    } catch (dbError) {
      // Database connection failed - continue without levels
      console.warn('Database unavailable, continuing without level data:', dbError);
    }

    // Add level information to each row (will be undefined if DB is down)
    for (const r of rows) {
      // Use database level if available, otherwise don't set level
      const key = String(r.profileId);
      if (levelMap.has(key)) {
        (r as any).level = levelMap.get(key);
      }
    }

    const previousRanks = await getLatestRankMap(0);
    for (const r of rows) {
      const prevRank = previousRanks.get(String(r.profileId));
      (r as any).rankDelta = typeof prevRank === "number" ? prevRank - r.rank : null;
    }

    return Response.json({
      leaderboardId: "combined-1v1",
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows
    }, {
      headers: { "Cache-Control": "s-maxage=300" } // 5 minute cache
    });
  } catch (e) {
    console.error("Combined 1v1 fetch failed:", e);
    return new Response(
      JSON.stringify({
        leaderboardId: "combined-1v1",
        lastUpdated: new Date().toISOString(),
        stale: true,
        rows: []
      }),
      { status: 502 }
    );
  }
}
