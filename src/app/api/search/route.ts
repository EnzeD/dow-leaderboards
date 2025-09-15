// Exact search by in-game alias using recent match history
// This avoids scanning all leaderboards and derives profile_id and SteamID from the response.

type RecentMatch = {
  matchId: number;
  mapName?: string;
  matchTypeId?: number;
  startTime?: number;
  endTime?: number;
  durationSec?: number;
  outcome?: 'Win' | 'Loss' | 'Unknown';
  oldRating?: number;
  newRating?: number;
  ratingDiff?: number;
  teamId?: number;
  raceId?: number;
  players?: Array<{ profileId: string; alias?: string; teamId?: number }>;
};

type SearchResult = {
  profileId: string;
  playerName: string; // exact alias
  steamId?: string;   // SteamID64 parsed from `/steam/<id>` when available
  recentMatches?: RecentMatch[];
  personalStats?: {
    profile?: {
      alias?: string;
      country?: string;
      level?: number;
      xp?: number;
      statgroupId?: number;
    };
    leaderboardStats?: Array<{
      leaderboardId: number;
      wins: number; losses: number; streak: number;
      rating: number; rank: number;
      lastmatchdate?: number;
      highestrank?: number; highestrating?: number;
      ranktotal?: number; regionrank?: number; regionranktotal?: number;
    }>;
  };
};

function parseSteamIdFromProfileName(name?: string): string | undefined {
  if (!name) return undefined;
  // Expected format: "/steam/7656119..." — extract the numeric tail
  const m = name.match(/\/steam\/(\d{17})/);
  return m?.[1];
}

async function searchByExactAlias(alias: string): Promise<SearchResult[]> {
  const trimmed = alias.trim();
  if (!trimmed) return [];

  const aliasesParam = encodeURIComponent(JSON.stringify([trimmed]));
  const url = `https://dow-api.reliclink.com/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=${aliasesParam}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();

    // Collect any objects within top-level arrays that include both profile_id and alias
    const candidates: Array<{ profile_id?: number | string; alias?: string; name?: string }> = [];
    for (const [k, v] of Object.entries<any>(data || {})) {
      if (Array.isArray(v)) {
        for (const el of v) {
          if (el && typeof el === 'object' && ('profile_id' in el) && ('alias' in el)) {
            candidates.push({ profile_id: (el as any).profile_id, alias: (el as any).alias, name: (el as any).name });
          }
        }
      }
    }

    // Filter to exact alias matches
    const exact = candidates.filter(c => (c.alias ?? '').trim() === trimmed);

    // Map to SearchResult with Steam ID parsed from "name" ("/steam/<id>")
    const results: SearchResult[] = [];
    const seen = new Set<string>();
    for (const c of exact) {
      const pid = String(c.profile_id ?? '');
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      results.push({
        profileId: pid,
        playerName: trimmed,
        steamId: parseSteamIdFromProfileName(c.name)
      });
    }

    // If not found, attempt a secondary join using objects that have profile_id+name
    if (results.length === 0) {
      // Build mapping of profile_id → name ("/steam/<id>")
      const idToName = new Map<string, string | undefined>();
      for (const [k, v] of Object.entries<any>(data || {})) {
        if (Array.isArray(v)) {
          for (const el of v) {
            if (el && typeof el === 'object' && ('profile_id' in el) && ('name' in el)) {
              idToName.set(String((el as any).profile_id), (el as any).name);
            }
          }
        }
      }

      // Also gather objects that have alias and some id field we can link via profile_id later
      const aliasOnly: Array<{ profile_id?: number | string; alias?: string }> = [];
      for (const [k, v] of Object.entries<any>(data || {})) {
        if (Array.isArray(v)) {
          for (const el of v) {
            if (el && typeof el === 'object' && ('alias' in el)) {
              aliasOnly.push({ profile_id: (el as any).profile_id, alias: (el as any).alias });
            }
          }
        }
      }

      for (const a of aliasOnly) {
        const pid = String(a.profile_id ?? '');
        if (!pid) continue;
        if ((a.alias ?? '').trim() === trimmed && !seen.has(pid)) {
          seen.add(pid);
          results.push({
            profileId: pid,
            playerName: trimmed,
            steamId: parseSteamIdFromProfileName(idToName.get(pid))
          });
        }
      }
    }

    return results;
  } catch (err) {
    console.error("Exact alias search failed:", err);
    return [];
  }
}

async function fetchRecentMatchesForAlias(alias: string, profileId: string, count: number = 10) {
  const aliasesParam = encodeURIComponent(JSON.stringify([alias]));
  const url = `https://dow-api.reliclink.com/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=${aliasesParam}&count=${count}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: any = await res.json();

    // Build alias map from any arrays containing profile_id + alias
    const aliasMap = new Map<string, string | undefined>();
    for (const v of Object.values<any>(data || {})) {
      if (Array.isArray(v)) {
        for (const el of v) {
          if (el && typeof el === 'object' && 'profile_id' in el && 'alias' in el) {
            aliasMap.set(String((el as any).profile_id), (el as any).alias);
          }
        }
      }
    }

    const matches: RecentMatch[] = [];
    const stats: any[] = Array.isArray(data?.matchHistoryStats) ? data.matchHistoryStats : [];
    for (const m of stats) {
      const members: any[] = Array.isArray(m?.matchhistorymember) ? m.matchhistorymember : [];
      const me = members.find((mm: any) => String(mm?.profile_id ?? '') === profileId);
      const oldRating = typeof me?.oldrating === 'number' ? me.oldrating : undefined;
      const newRating = typeof me?.newrating === 'number' ? me.newrating : undefined;
      const ratingDiff = (typeof oldRating === 'number' && typeof newRating === 'number') ? (newRating - oldRating) : undefined;
      const outcome: 'Win' | 'Loss' | 'Unknown' = me?.outcome === 1 ? 'Win' : (me?.outcome === 0 ? 'Loss' : 'Unknown');

      const players: Array<{ profileId: string; alias?: string; teamId?: number }> = members.map((p: any) => ({
        profileId: String(p?.profile_id ?? ''),
        alias: aliasMap.get(String(p?.profile_id ?? '')),
        teamId: typeof p?.teamid === 'number' ? p.teamid : undefined,
      }));

      matches.push({
        matchId: Number(m?.id ?? 0) || 0,
        mapName: m?.mapname,
        matchTypeId: typeof m?.matchtype_id === 'number' ? m.matchtype_id : undefined,
        startTime: typeof m?.startgametime === 'number' ? m.startgametime : undefined,
        endTime: typeof m?.completiontime === 'number' ? m.completiontime : undefined,
        durationSec: (typeof m?.completiontime === 'number' && typeof m?.startgametime === 'number') ? (m.completiontime - m.startgametime) : undefined,
        outcome,
        oldRating,
        newRating,
        ratingDiff,
        teamId: typeof me?.teamid === 'number' ? me.teamid : undefined,
        raceId: typeof me?.race_id === 'number' ? me.race_id : undefined,
        players,
      });
    }

    return matches;
  } catch (e) {
    console.warn('recent match history fetch failed for', alias, e);
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    const q = (typeof query === "string" ? query : "").trim();

    if (!q) {
      return Response.json({ results: [], error: "Alias required" }, { status: 400 });
    }

    const results = await searchByExactAlias(q);

    // Enrich with personal stats and recent match history when possible
    const enriched: SearchResult[] = [];
    for (const r of results) {
      let out = { ...r } as SearchResult;

      // Personal stats via Steam ID (if present)
      if (r.steamId) {
        try {
          const profileName = encodeURIComponent(JSON.stringify([`/steam/${r.steamId}`]));
          const url = `https://dow-api.reliclink.com/community/leaderboard/getPersonalStat?&title=dow1-de&profile_names=${profileName}`;
          const res = await fetch(url, { cache: "no-store" });
          if (!res.ok) throw new Error(`personalStat HTTP ${res.status}`);
          const data: any = await res.json();

          const group = Array.isArray(data?.statGroups) ? data.statGroups[0] : undefined;
          const member = Array.isArray(group?.members) ? group.members[0] : undefined;
          const profile = member ? {
            alias: member.alias,
            country: member.country,
            level: Number(member.level ?? 0) || undefined,
            xp: Number(member.xp ?? 0) || undefined,
            statgroupId: Number(group?.id ?? member?.personal_statgroup_id ?? 0) || undefined
          } : undefined;

          const lbStatsRaw: any[] = Array.isArray(data?.leaderboardStats) ? data.leaderboardStats : [];
          const leaderboardStats = lbStatsRaw.map(s => ({
            leaderboardId: Number(s.leaderboard_id ?? 0) || 0,
            wins: Number(s.wins ?? 0),
            losses: Number(s.losses ?? 0),
            streak: Number(s.streak ?? 0),
            rating: Number(s.rating ?? 0),
            rank: Number(s.rank ?? -1),
            lastmatchdate: typeof s.lastmatchdate === 'number' ? s.lastmatchdate : undefined,
            highestrank: Number(s.highestrank ?? 0) || undefined,
            highestrating: Number(s.highestrating ?? 0) || undefined,
            ranktotal: Number(s.ranktotal ?? 0) || undefined,
            regionrank: Number(s.regionrank ?? 0) || undefined,
            regionranktotal: Number(s.regionranktotal ?? 0) || undefined,
          }));

          out = { ...out, personalStats: { profile, leaderboardStats } };
          await new Promise(res => setTimeout(res, 120));
        } catch (e) {
          console.warn('Failed to fetch personal stats for', r.profileId, e);
        }
      }

      // Recent matches by alias, limited set
      try {
        const recentMatches = await fetchRecentMatchesForAlias(r.playerName, r.profileId, 10);
        out = { ...out, recentMatches };
        await new Promise(res => setTimeout(res, 120));
      } catch {}

      enriched.push(out);
    }

    return Response.json({
      results: enriched,
      query: q,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Search API error:", error);
    return Response.json({ results: [], error: "Search failed" }, { status: 500 });
  }
}
