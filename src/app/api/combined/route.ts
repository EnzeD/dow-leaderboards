import { fetchCombined1v1, resolveNames } from "@/lib/relic";

export async function GET() {
  try {
    const rows = await fetchCombined1v1();
    const missing = rows.filter(r => !r.playerName).map(r => r.profileId);
    const map = missing.length ? await resolveNames(missing) : {};
    for (const r of rows) r.playerName = r.playerName || map[r.profileId] || "Unknown";

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