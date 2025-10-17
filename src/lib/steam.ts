const RELIC_API_BASE = "https://dow-api.reliclink.com";

type SteamSummary = {
  steamId: string | null;
  personaName: string | null;
  avatar: string | null;
  avatarMedium: string | null;
  avatarFull: string | null;
};

const buildProfileName = (steamId: string) => `/steam/${steamId}`;

const encodeProfileNames = (profileNames: string[]) =>
  encodeURIComponent(JSON.stringify(profileNames));

export async function fetchSteamSummaryByProfile(
  profileId: number | string,
  steamId64: string | null | undefined,
): Promise<SteamSummary | null> {
  const trimmedSteamId = steamId64?.trim();

  if (!trimmedSteamId) {
    return null;
  }

  const profileIdStr = String(profileId).trim();
  if (!profileIdStr) {
    return null;
  }

  const profileNamesParam = encodeProfileNames([buildProfileName(trimmedSteamId)]);
  const url = `${RELIC_API_BASE}/community/external/proxysteamuserrequest?title=dow1-de&request=/ISteamUser/GetPlayerSummaries/v0002/&profile_ids=${profileIdStr}&profileNames=${profileNamesParam}`;

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "User-Agent": "dow-leaderboards/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Steam summary request failed with ${response.status}`);
    }

    const data = await response.json();
    const players = data?.steamResults?.response?.players;

    if (!Array.isArray(players) || players.length === 0) {
      return null;
    }

    const player = players[0] ?? null;

    if (!player) {
      return null;
    }

    return {
      steamId: typeof player.steamid === "string" ? player.steamid : null,
      personaName: typeof player.personaname === "string" ? player.personaname : null,
      avatar: typeof player.avatar === "string" ? player.avatar : null,
      avatarMedium: typeof player.avatarmedium === "string" ? player.avatarmedium : null,
      avatarFull: typeof player.avatarfull === "string" ? player.avatarfull : null,
    };
  } catch (error) {
    console.warn("[steam] failed to fetch summary", error);
    return null;
  }
}
