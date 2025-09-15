import { fetchCombined1v1Max, resolveNames } from "@/lib/relic";

export async function GET(_req: Request, ctx: { params: { limit?: string } }) {
  try {
    const rows = await fetchCombined1v1Max();
    const missing = rows.filter(r => !r.playerName).map(r => r.profileId);
    const map = missing.length ? await resolveNames(missing) : {};
    for (const r of rows) r.playerName = r.playerName || map[r.profileId] || "Unknown";

    const limitParam = Number(ctx.params?.limit || '200');
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : 200;
    const limited = rows.slice(0, limit);

    return Response.json({
      leaderboardId: "combined-1v1",
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows: limited
    }, {
      headers: { "Cache-Control": "public, s-maxage=3600" }
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

