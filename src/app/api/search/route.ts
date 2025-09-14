import { fetchLeaderboards, fetchTop100, resolveNames } from "@/lib/relic";

type SearchResult = {
  profileId: string;
  playerName: string;
  steamProfile?: any;
  leaderboardAppearances: Array<{
    leaderboardId: number;
    leaderboardName: string;
    rank: number;
    rating: number;
    faction?: string;
    matchType?: string;
  }>;
};

// Enhanced fetch that can get more than top 100
async function fetchPlayers(leaderboardId: number, count: number = 200): Promise<any[]> {
  const batchSize = 100;
  const allRows: any[] = [];

  for (let start = 1; start <= count; start += batchSize) {
    const currentCount = Math.min(batchSize, count - start + 1);
    const url = `https://dow-api.reliclink.com/community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=${leaderboardId}&start=${start}&count=${currentCount}&sortBy=1`;

    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();

      if (data?.statGroups && data?.leaderboardStats) {
        const groups = data.statGroups;
        const stats = data.leaderboardStats;
        const groupsById = new Map(groups.map((g: any) => [g.id, g]));

        const rows = stats.map((s: any) => {
          const group = groupsById.get(s.statgroup_id) as any;
          const member = group?.members?.[0];
          return {
            rank: s.rank,
            profileId: String(member?.profile_id || ""),
            playerName: member?.alias || "",
            rating: s.rating || 0,
            wins: s.wins || 0,
            losses: s.losses || 0,
            streak: s.streak || 0
          };
        }).filter((r: any) => r.profileId);

        allRows.push(...rows);
      }
    } catch (error) {
      console.error(`Error fetching leaderboard ${leaderboardId} batch ${start}-${start + currentCount - 1}:`, error);
      break; // Stop on error to avoid hammering the API
    }

    // Small delay to respect rate limits
    if (start + batchSize <= count) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return allRows;
}

async function searchProfiles(query: string): Promise<SearchResult[]> {
  try {
    const { items: leaderboards } = await fetchLeaderboards();
    const searchResults = new Map<string, SearchResult>();
    const queryLower = query.toLowerCase();

    console.log(`🔍 Searching for "${query}" across ${leaderboards.length} leaderboards`);

    // Search through key 1v1 leaderboards first (where most activity is)
    const priorityLeaderboards = leaderboards.filter(lb =>
      lb.matchType === '1v1' || lb.name.includes('1v1')
    ).slice(0, 5);

    for (const leaderboard of priorityLeaderboards) {
      try {
        console.log(`Searching ${leaderboard.name}...`);

        // Get top 200 players from this leaderboard
        const rows = await fetchPlayers(leaderboard.id, 200);

        if (rows.length === 0) continue;

        // Get Steam names for all players
        const profileIds = rows.map(r => r.profileId).filter(Boolean);
        const nameMap = await resolveNames(profileIds);

        let matches = 0;
        for (const row of rows) {
          const steamName = nameMap[row.profileId] || "";
          const alias = row.playerName || "";

          // Check for matches
          const steamMatch = steamName.toLowerCase().includes(queryLower);
          const aliasMatch = alias.toLowerCase().includes(queryLower);

          if (steamMatch || aliasMatch) {
            matches++;
            console.log(`✅ Found: ${steamName || alias} (${row.profileId}) - Rank ${row.rank}`);

            const existing = searchResults.get(row.profileId);
            const appearance = {
              leaderboardId: leaderboard.id,
              leaderboardName: leaderboard.name,
              rank: row.rank,
              rating: row.rating,
              faction: leaderboard.faction,
              matchType: leaderboard.matchType
            };

            if (existing) {
              existing.leaderboardAppearances.push(appearance);
            } else {
              searchResults.set(row.profileId, {
                profileId: row.profileId,
                playerName: steamName || alias || "Unknown",
                steamProfile: steamName ? { personaname: steamName } : undefined,
                leaderboardAppearances: [appearance]
              });
            }
          }
        }

        console.log(`📊 ${leaderboard.name}: ${matches} matches from ${rows.length} players`);

      } catch (error) {
        console.error(`Error searching ${leaderboard.name}:`, error);
      }
    }

    const results = Array.from(searchResults.values())
      .sort((a, b) => {
        const aBestRank = Math.min(...a.leaderboardAppearances.map(app => app.rank));
        const bBestRank = Math.min(...b.leaderboardAppearances.map(app => app.rank));
        return aBestRank - bBestRank;
      })
      .slice(0, 20);

    console.log(`🎯 Search complete: ${results.length} unique players found`);
    return results;

  } catch (error) {
    console.error("Search error:", error);
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const { query } = await request.json();

    if (!query || typeof query !== 'string' || query.trim().length < 2) {
      return Response.json({
        results: [],
        error: "Query must be at least 2 characters long"
      }, { status: 400 });
    }

    const results = await searchProfiles(query.trim());

    return Response.json({
      results,
      query: query.trim(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Search API error:", error);
    return Response.json({
      results: [],
      error: "Search failed"
    }, { status: 500 });
  }
}