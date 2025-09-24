import { fetchCombined1v1Max, resolveNames } from "@/lib/relic";
import { getLatestRankMap } from "@/lib/rank-history";
import { supabase } from "@/lib/supabase";
import { getLevelFromXP } from "@/lib/xp-levels";
// This route reads request.url (query params). Mark dynamic to avoid static export errors.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rows = await fetchCombined1v1Max();
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
        // Process in chunks to avoid potential query size limits
        const chunkSize = 50;
        const chunks = [];
        for (let i = 0; i < profileIds.length; i += chunkSize) {
          chunks.push(profileIds.slice(i, i + chunkSize));
        }

        for (const chunk of chunks) {
          const { data: players, error } = await supabase
            .from('players')
            .select('profile_id, xp')
            .in('profile_id', chunk);

          if (error) {
            console.error('Error fetching player levels chunk:', error);
          } else if (players && players.length > 0) {
            players.forEach(player => {
              const level = getLevelFromXP(player.xp ?? undefined);
              levelMap.set(String(player.profile_id), level);
            });
          }
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

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit') || '200');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 200;

    const limited = rows.slice(0, limit);
    const previousRanks = await getLatestRankMap(0);
    for (const r of limited) {
      const prevRank = previousRanks.get(String(r.profileId));
      (r as any).rankDelta = typeof prevRank === "number" ? prevRank - r.rank : null;
    }

    return Response.json({
      leaderboardId: "combined-1v1",
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows: limited
    }, {
      headers: { "Cache-Control": "public, s-maxage=300" }
    });
  } catch (e) {
    console.error("cache/combined-1v1 fetch failed:", e);
    return new Response(
      JSON.stringify({
        leaderboardId: "combined-1v1",
        lastUpdated: new Date().toISOString(),
        stale: true,
        rows: []
      }),
      { status: 502, headers: { "Cache-Control": "public, s-maxage=60" } }
    );
  }
}
