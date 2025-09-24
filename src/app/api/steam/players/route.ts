// Restored for backwards compatibility during migration
// This endpoint should be removed once all clients are updated

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours - aggressive caching
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=3600",
  "CDN-Cache-Control": "max-age=86400",
};

export async function GET() {
  const appId = "3556750";

  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
      { next: { revalidate: 3600 } } // Next.js cache for 1 hour
    );

    const data = await res.json();
    const playerCount = data?.response?.player_count || null;

    return Response.json(
      {
        appId,
        playerCount,
        success: playerCount !== null,
        lastUpdated: new Date().toISOString(),
      },
      { headers: CACHE_HEADERS }
    );
  } catch {
    return Response.json(
      {
        appId,
        playerCount: null,
        success: false,
        lastUpdated: new Date().toISOString(),
      },
      { headers: CACHE_HEADERS }
    );
  }
}