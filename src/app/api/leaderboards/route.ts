import { fetchLeaderboards } from "@/lib/relic";

export async function GET() {
  try {
    return Response.json(await fetchLeaderboards(), {
      headers: { "Cache-Control": "s-maxage=3600" }
    });
  }
  catch (e) {
    return new Response(
      JSON.stringify({
        items: [],
        lastUpdated: new Date().toISOString(),
        error: "fetch_failed"
      }),
      { status: 502 }
    );
  }
}