import { fetchLeaderboardRows, resolveNames } from "@/lib/relic";
import { supabase } from "@/lib/supabase";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const idNum = Number(ctx.params?.id ?? 0);
  if (!idNum || Number.isNaN(idNum)) {
    return Response.json({ error: "invalid_leaderboard_id" }, { status: 400 });
  }
  try {
    const rows = await fetchLeaderboardRows(idNum, 200);
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
          .select('profile_id, calculated_level, xp')
          .in('profile_id', profileIds);

        if (error) {
          console.error('Error fetching player levels:', error);
          console.error('Profile IDs attempted:', profileIds.slice(0, 5));
        } else if (players && players.length > 0) {
        players.forEach(player => {
          // Use calculated_level from database, not the API
          const level = player.calculated_level || 1;
          levelMap.set(String(player.profile_id), level);
        });

        // Debug: Log level data
        console.log(`Leaderboard ${idNum}: Found ${players.length} players in DB, levelMap size: ${levelMap.size}`);
        console.log('Sample player levels:', players.slice(0, 3).map(p => ({
          id: p.profile_id,
          calculated_level: p.calculated_level,
          xp: p.xp
        })));
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

    return Response.json({
      leaderboardId: idNum,
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows
    }, {
      headers: { "Cache-Control": "public, s-maxage=300" }
    });
  } catch (e) {
    console.error("cache/leaderboard fetch failed:", e);
    return new Response(
      JSON.stringify({
        leaderboardId: idNum,
        lastUpdated: new Date().toISOString(),
        stale: true,
        rows: []
      }),
      { status: 502, headers: { "Cache-Control": "public, s-maxage=60" } }
    );
  }
}
