import { fetchCombined1v1AllEntriesMax, resolveNames } from "@/lib/relic";
import { buildCombinedMultiKey, getLatestCombinedMultiRankMap } from "@/lib/rank-history";
import { supabase } from "@/lib/supabase";
import { getLevelFromXP } from "@/lib/xp-levels";

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const rows = await fetchCombined1v1AllEntriesMax();
    const missing = rows.filter(r => !r.playerName).map(r => r.profileId);
    const map = missing.length ? await resolveNames(missing) : {};
    for (const r of rows) r.playerName = r.playerName || map[r.profileId] || "Unknown";

    const levelMap = new Map<string, number>();
    try {
      const profileIds = Array.from(
        new Set(
          rows
            .map(r => Number(r.profileId))
            .filter(id => !Number.isNaN(id))
        )
      );

      if (profileIds.length > 0) {
        const chunkSize = 50;
        for (let i = 0; i < profileIds.length; i += chunkSize) {
          const chunk = profileIds.slice(i, i + chunkSize);
          const { data: players, error } = await supabase
            .from('players')
            .select('profile_id, xp')
            .in('profile_id', chunk);

          if (error) {
            console.error('Error fetching player levels chunk:', error);
            continue;
          }

          players?.forEach(player => {
            const level = getLevelFromXP(player.xp ?? undefined);
            levelMap.set(String(player.profile_id), level);
          });
        }
      }
    } catch (dbError) {
      console.warn('Database unavailable, continuing without level data:', dbError);
    }

    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get('limit') || '200');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 200;
    const limited = rows.slice(0, limit);

    const previousRanks = await getLatestCombinedMultiRankMap();

    for (const r of limited) {
      const key = String(r.profileId);
      if (levelMap.has(key)) {
        (r as any).level = levelMap.get(key);
      }
      const deltaKey = buildCombinedMultiKey(r);
      const prevRank = deltaKey ? previousRanks.get(deltaKey) : undefined;
      (r as any).rankDelta = typeof prevRank === "number" ? prevRank - r.rank : null;
    }

    return Response.json({
      leaderboardId: "combined-1v1-multi",
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows: limited
    }, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" }
    });
  } catch (e) {
    console.error("cache/combined-1v1-multi fetch failed:", e);
    return new Response(
      JSON.stringify({
        leaderboardId: "combined-1v1-multi",
        lastUpdated: new Date().toISOString(),
        stale: true,
        rows: []
      }),
      { status: 502, headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  }
}
