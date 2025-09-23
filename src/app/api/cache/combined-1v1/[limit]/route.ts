import { fetchCombined1v1Max, resolveNames } from "@/lib/relic";
import { supabase } from "@/lib/supabase";

export async function GET(_req: Request, ctx: { params: Promise<{ limit?: string }> | { limit?: string } }) {
  try {
    // Handle both sync and async params (Next.js 14 compatibility)
    const params = 'then' in ctx.params ? await ctx.params : ctx.params;
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

        let allPlayers: any[] = [];
        for (const chunk of chunks) {
          const { data: players, error } = await supabase
            .from('players')
            .select('profile_id, calculated_level, xp')
            .in('profile_id', chunk);

          if (error) {
            console.error('Error fetching player levels chunk:', error);
          } else if (players && players.length > 0) {
            allPlayers = allPlayers.concat(players);
          }
        }

        if (allPlayers.length > 0) {
          allPlayers.forEach(player => {
          // Use calculated_level from database, not the API
          const level = player.calculated_level || 1;
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
      const dbLevel = levelMap.get(String(r.profileId));
      if (dbLevel) {
        (r as any).level = dbLevel;
      }
    }

    const limitParam = Number(params?.limit || '200');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 200;
    const limited = rows.slice(0, limit);

    return Response.json({
      leaderboardId: "combined-1v1",
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows: limited
    }, {
      headers: { "Cache-Control": "public, s-maxage=300" }
    });
  } catch (e) {
    console.error("cache/combined-1v1/[limit] fetch failed:", e);
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
