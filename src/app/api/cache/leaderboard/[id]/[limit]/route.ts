import { fetchLeaderboardRows, resolveNames } from "@/lib/relic";

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, ctx: { params: { id: string; limit: string } }) {
  const idNum = Number(ctx.params?.id ?? 0);
  if (!idNum || Number.isNaN(idNum)) {
    return Response.json({ error: "invalid_leaderboard_id" }, { status: 400 });
  }
  const rawLimit = Number(ctx.params?.limit ?? 200);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 10000) : 200;
  try {
    const rows = await fetchLeaderboardRows(idNum, limit);
    const missing = rows.filter(r => !r.playerName).map(r => r.profileId);
    const map = missing.length ? await resolveNames(missing) : {};
    for (const r of rows) r.playerName = r.playerName || map[r.profileId] || "Unknown";

    return Response.json({
      leaderboardId: idNum,
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows
    }, {
      headers: { "Cache-Control": "public, s-maxage=300" }
    });
  } catch (e) {
    console.error("cache/leaderboard/[id]/[limit] fetch failed:", e);
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
