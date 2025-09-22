import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profile_id');
    const steamId = searchParams.get('steam_id');
    const alias = searchParams.get('alias');

    if (!profileId && !steamId && !alias) {
      return Response.json({
        results: [],
        error: "profile_id, steam_id, or alias required"
      }, { status: 400 });
    }

    let searchResults: any[] = [];

    // Try Steam ID first if available (most precise)
    if (steamId) {
      try {
        const profileName = encodeURIComponent(JSON.stringify([`/steam/${steamId}`]));
        const url = `https://dow-api.reliclink.com/community/leaderboard/getPersonalStat?&title=dow1-de&profile_names=${profileName}`;
        const res = await fetch(url, { cache: "no-store" });

        if (res.ok) {
          const data: any = await res.json();

          if (data?.statGroups?.length > 0) {
            const group = data.statGroups[0];
            const member = group.members?.[0];

            if (member) {
              const result = {
                profileId: member.profile_id || profileId,
                playerName: member.alias || alias,
                steamId: steamId,
                personalStats: {
                  profile: {
                    alias: member.alias,
                    country: member.country,
                    level: Number(member.level ?? 0) || undefined,
                    xp: Number(member.xp ?? 0) || undefined,
                    statgroupId: Number(group.id ?? member?.personal_statgroup_id ?? 0) || undefined
                  },
                  leaderboardStats: (data.leaderboardStats || []).map((s: any) => ({
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
                  }))
                }
              };

              searchResults = [result];
            }
          }
        }
      } catch (error) {
        console.error('Steam ID search failed:', error);
      }
    }

    // Fallback to recent match history search by alias if Steam ID didn't work
    if (searchResults.length === 0 && alias) {
      try {
        const aliasesParam = encodeURIComponent(JSON.stringify([alias]));
        const url = `https://dow-api.reliclink.com/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=${aliasesParam}`;
        const res = await fetch(url, { cache: "no-store" });

        if (res.ok) {
          const data: any = await res.json();

          // Look for the specific profile_id if provided
          const candidates: Array<{ profile_id?: number | string; alias?: string; name?: string }> = [];
          for (const [k, v] of Object.entries<any>(data || {})) {
            if (Array.isArray(v)) {
              for (const el of v) {
                if (el && typeof el === 'object' && ('profile_id' in el) && ('alias' in el)) {
                  candidates.push({
                    profile_id: (el as any).profile_id,
                    alias: (el as any).alias,
                    name: (el as any).name
                  });
                }
              }
            }
          }

          // Filter by profile_id if provided, otherwise use alias match
          let filtered = candidates;
          if (profileId) {
            filtered = candidates.filter(c => String(c.profile_id) === String(profileId));
          }
          if (filtered.length === 0) {
            filtered = candidates.filter(c => (c.alias ?? '').trim() === alias.trim());
          }

          for (const candidate of filtered.slice(0, 1)) { // Take first match
            const parsedSteamId = candidate.name?.match(/\/steam\/(\d{17})/)?.[1];
            searchResults.push({
              profileId: String(candidate.profile_id ?? ''),
              playerName: candidate.alias || alias,
              steamId: parsedSteamId,
              personalStats: {
                profile: {
                  alias: candidate.alias
                }
              }
            });
          }
        }
      } catch (error) {
        console.error('Alias search failed:', error);
      }
    }

    // If we have a result with Steam ID, try to get recent matches
    if (searchResults.length > 0 && alias) {
      try {
        const aliasesParam = encodeURIComponent(JSON.stringify([alias]));
        const url = `https://dow-api.reliclink.com/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=${aliasesParam}&count=10`;
        const res = await fetch(url, { cache: 'no-store' });

        if (res.ok) {
          const data: any = await res.json();

          // Add recent matches to the first result
          const stats: any[] = Array.isArray(data?.matchHistoryStats) ? data.matchHistoryStats : [];
          const recentMatches: any[] = [];
          const targetProfileId = searchResults[0].profileId;

          for (const m of stats.slice(0, 10)) {
            const members: any[] = Array.isArray(m?.matchhistorymember) ? m.matchhistorymember : [];
            const me = members.find((mm: any) => String(mm?.profile_id ?? '') === String(targetProfileId));

            if (me) {
              const outcome = me?.outcome === 1 ? 'Win' : (me?.outcome === 0 ? 'Loss' : 'Unknown');
              recentMatches.push({
                matchId: Number(m?.id ?? 0) || 0,
                mapName: m?.mapname,
                outcome,
                oldRating: typeof me?.oldrating === 'number' ? me.oldrating : undefined,
                newRating: typeof me?.newrating === 'number' ? me.newrating : undefined,
                ratingDiff: (typeof me?.oldrating === 'number' && typeof me?.newrating === 'number')
                  ? (me.newrating - me.oldrating) : undefined,
              });
            }
          }

          if (recentMatches.length > 0) {
            searchResults[0].recentMatches = recentMatches;
          }
        }

        await new Promise(res => setTimeout(res, 120)); // Rate limit delay
      } catch (error) {
        console.error('Recent matches fetch failed:', error);
      }
    }

    return Response.json({
      results: searchResults,
      query: { profileId, steamId, alias },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Profile search API error:", error);
    return Response.json({
      results: [],
      error: "Search failed"
    }, { status: 500 });
  }
}