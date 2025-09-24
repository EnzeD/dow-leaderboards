// Client-side Steam API fetching using CORS proxy
// This eliminates ALL Vercel edge requests for player count

const STEAM_APP_ID = '3556750'; // DoW:DE

// Free CORS proxy services (fallback chain)
const CORS_PROXIES = [
  (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://cors-anywhere.herokuapp.com/${url}`, // Requires demo access
];

export async function fetchPlayerCountClient(): Promise<{ playerCount: number | null; success: boolean }> {
  const steamUrl = `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${STEAM_APP_ID}`;

  // Try each CORS proxy until one works
  for (const proxyFn of CORS_PROXIES) {
    try {
      const proxyUrl = proxyFn(steamUrl);
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      if (response.ok) {
        const data = await response.json();
        const playerCount = data?.response?.player_count;

        if (typeof playerCount === 'number') {
          return { playerCount, success: true };
        }
      }
    } catch (error) {
      // Try next proxy
      continue;
    }
  }

  // All proxies failed, return cached value from localStorage
  try {
    const cached = localStorage.getItem('dow_player_count_backup');
    if (cached) {
      const { count } = JSON.parse(cached);
      return { playerCount: count, success: false };
    }
  } catch {}

  return { playerCount: null, success: false };
}

// Cache successful results in localStorage
export function cachePlayerCount(count: number): void {
  try {
    localStorage.setItem('dow_player_count_backup', JSON.stringify({
      count,
      timestamp: Date.now()
    }));
  } catch {}
}