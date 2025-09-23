const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CACHE_HEADERS = {
  "Cache-Control": "public, max-age=1800, s-maxage=1800, stale-while-revalidate=300",
};

type SteamPayload = {
  appId: string;
  playerCount: number | null;
  success: boolean;
  lastUpdated: string;
  error?: string;
};

type CacheEntry = {
  timestamp: number;
  payload: SteamPayload;
  status: number;
};

let cachedEntry: CacheEntry | null = null;
let inflightRequest: Promise<CacheEntry> | null = null;

function buildResponse(entry: CacheEntry) {
  return Response.json(entry.payload, {
    status: entry.status,
    headers: CACHE_HEADERS,
  });
}

async function fetchSteamPlayerCount(appId: string): Promise<CacheEntry> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  const url = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${encodeURIComponent(
    appId
  )}`;

  const now = new Date().toISOString();

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const entry: CacheEntry = {
        timestamp: Date.now(),
        status: 502,
        payload: {
          appId,
          playerCount: null,
          success: false,
          lastUpdated: now,
          error: "upstream_error",
        },
      };
      cachedEntry = entry;
      return entry;
    }

    const data = await res.json();
    const playerCount = typeof data?.response?.player_count === "number" ? data.response.player_count : null;
    const success = data?.response?.result === 1 && typeof playerCount === "number";

    const entry: CacheEntry = {
      timestamp: Date.now(),
      status: 200,
      payload: {
        appId,
        playerCount,
        success,
        lastUpdated: now,
      },
    };
    cachedEntry = entry;
    return entry;
  } catch (error) {
    const entry: CacheEntry = {
      timestamp: Date.now(),
      status: 502,
      payload: {
        appId,
        playerCount: null,
        success: false,
        lastUpdated: now,
        error: "fetch_failed",
      },
    };
    cachedEntry = entry;
    return entry;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET() {
  const appId = process.env.STEAM_APP_ID_DOW_DE || process.env.STEAM_APP_ID || "3556750"; // DoW:DE default

  // No .env required; default appId is provided above.

  const now = Date.now();
  if (
    cachedEntry &&
    cachedEntry.payload.appId === appId &&
    now - cachedEntry.timestamp < CACHE_TTL_MS
  ) {
    return buildResponse(cachedEntry);
  }

  if (!inflightRequest) {
    inflightRequest = fetchSteamPlayerCount(appId);
  }

  try {
    const entry = await inflightRequest;
    return buildResponse(entry);
  } finally {
    inflightRequest = null;
  }
}
