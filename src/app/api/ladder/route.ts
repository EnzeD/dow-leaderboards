import { fetchTop100, resolveNames } from "@/lib/relic";

export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("leaderboard_id") ?? 1);
  try {
    const rows = await fetchTop100(id);
    const missing = rows.filter(r => !r.playerName).map(r => r.profileId);
    const map = missing.length ? await resolveNames(missing) : {};
    for (const r of rows) r.playerName = r.playerName || map[r.profileId] || "Unknown";
    return Response.json({
      leaderboardId: id,
      lastUpdated: new Date().toISOString(),
      stale: false,
      rows
    });
  } catch {
    // TODO: serve cached copy here; for brevity return 502
    return new Response(
      JSON.stringify({
        leaderboardId: id,
        lastUpdated: new Date().toISOString(),
        stale: true,
        rows: []
      }),
      { status: 502 }
    );
  }
}