import { fetchLeaderboardRows, resolveNames } from "@/lib/relic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const idNum = Number(ctx.params?.id ?? 0);
  if (!idNum || Number.isNaN(idNum)) {
    return Response.json({ error: "invalid_leaderboard_id" }, { status: 400 });
  }
  try {
    const rows = await fetchLeaderboardRows(idNum, 200);
    const missing = rows.filter(r => !r.playerName).map(r => r.profileId);
    const map = missing.length ? await resolveNames(missing) : {};
    for (const r of rows) {
      const resolved = map[r.profileId];
      if (!r.playerName) r.playerName = resolved?.name || "Unknown";
      if (!r.steamId && resolved?.steamId) r.steamId = resolved.steamId;
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
