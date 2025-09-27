import { fetchCombined1v1AllEntries, resolveNames } from "@/lib/relic";
import { getLatestRankMap } from "@/lib/rank-history";
import { supabase } from "@/lib/supabase";
import { getLevelFromXP } from "@/lib/xp-levels";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await fetchCombined1v1AllEntries();
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
      console.warn('Database unavailable, continuing without level data:', dbError);
    }

    const previousRanks = await getLatestRankMap(-1);

    for (const r of rows) {
      const key = String(r.profileId);
      if (levelMap.has(key)) {
        (r as any).level = levelMap.get(key);
      }
      const prevRank = previousRanks.get(key);
      (r as any).rankDelta = typeof prevRank === "number" ? prevRank - r.rank : null;
    }

    return Response.json({
      leaderboardId: "combined-1v1-multi",
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows
    }, {
      headers: { "Cache-Control": "s-maxage=300" }
    });
  } catch (e) {
    console.error("Combined 1v1 multi fetch failed:", e);
    return new Response(
      JSON.stringify({
        leaderboardId: "combined-1v1-multi",
        lastUpdated: new Date().toISOString(),
        stale: true,
        rows: []
      }),
      { status: 502 }
    );
  }
}
