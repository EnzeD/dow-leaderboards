export async function GET() {
  const appId = process.env.STEAM_APP_ID_DOW_DE || process.env.STEAM_APP_ID || "3556750"; // DoW:DE default

  // No .env required; default appId is provided above.

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const url = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${encodeURIComponent(
      appId
    )}`;
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeout);

    if (!res.ok) {
    return Response.json(
      {
        appId,
        playerCount: null,
        success: false,
        lastUpdated: new Date().toISOString(),
        error: "upstream_error",
      },
      { status: 502, headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=30" } }
    );
    }

    const data = await res.json();
    const playerCount = typeof data?.response?.player_count === "number" ? data.response.player_count : null;
    const success = data?.response?.result === 1 && typeof playerCount === "number";

    return Response.json(
      {
        appId,
        playerCount,
        success,
        lastUpdated: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=30" } }
    );
  } catch (e) {
    return Response.json(
      {
        appId,
        playerCount: null,
        success: false,
        lastUpdated: new Date().toISOString(),
        error: "fetch_failed",
      },
      { status: 502, headers: { "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=30" } }
    );
  }
}
