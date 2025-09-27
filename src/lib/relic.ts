const BASE = "https://dow-api.reliclink.com";

const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_FETCH_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 400;

type FetchOptions = RequestInit & { next?: { revalidate?: number } };

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchJsonWithRetry<T = unknown>(url: string, init?: FetchOptions, retries = MAX_FETCH_RETRIES): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, init);

      if (!response.ok) {
        const retriable = RETRYABLE_STATUS_CODES.has(response.status);

        if (!retriable || attempt === retries - 1) {
          const errorBody = await response.text().catch(() => "");
          throw new Error(`Request to ${url} failed with ${response.status} ${response.statusText}${errorBody ? `: ${errorBody}` : ""}`);
        }

        console.warn(`Retryable response ${response.status} from ${url} (attempt ${attempt + 1}/${retries})`);
        await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
        continue;
      }

      return await response.json() as T;
    } catch (error) {
      lastError = error;

      if (attempt === retries - 1) {
        throw error instanceof Error ? error : new Error(String(error));
      }

      console.warn(`Fetch attempt ${attempt + 1} for ${url} failed, retrying...`, error);
      await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`Request to ${url} failed after ${retries} attempts`);
}

type RawGroup = { id: number, members: Array<{ profile_id: number, alias?: string, country?: string }> };
type RawStat = { statgroup_id: number, rank: number, rating: number, wins: number, losses: number, streak: number, lastmatchdate?: number };

export type LadderRow = {
  rank: number; profileId: string; playerName: string;
  rating: number; wins: number; losses: number; winrate: number; streak: number;
  country?: string; lastMatchDate?: Date; faction?: string; level?: number;
  rankDelta?: number | null; originalRank?: number; leaderboardId?: number;
};

export type Leaderboard = {
  id: number;
  name: string;
  faction?: string;
  matchType?: string;
};

// Faction and match type parsing utilities
export function parseFactionFromName(name: string): string {
  if (name.includes('chaos_marine')) return 'Chaos';
  if (name.includes('dark_eldar')) return 'Dark Eldar';
  if (name.includes('eldar') && !name.includes('dark')) return 'Eldar';
  if (name.includes('guard')) return 'Imperial Guard';
  if (name.includes('necron')) return 'Necrons';
  if (name.includes('ork')) return 'Orks';
  if (name.includes('sisters')) return 'Sisters of Battle';
  if (name.includes('space_marine')) return 'Space Marines';
  if (name.includes('tau')) return 'Tau';
  return 'Unknown';
}

export function parseMatchTypeFromName(name: string): string {
  if (name.startsWith('1v1')) return '1v1';
  if (name.startsWith('2v2')) return '2v2';
  if (name.startsWith('3v3')) return '3v3';
  if (name.startsWith('4v4')) return '4v4';
  if (name.includes('Custom')) return 'Custom';
  return 'Unknown';
}

export function getFactionFromLeaderboardId(leaderboards: Leaderboard[], leaderboardId: number): string {
  const lb = leaderboards.find(l => l.id === leaderboardId);
  return lb?.faction || 'Unknown';
}

export async function fetchLeaderboards() {
  const url = `${BASE}/community/leaderboard/GetAvailableLeaderboards?title=dow1-de`;
  const data = await fetchJsonWithRetry<any>(url, { cache: "force-cache" });
  const items: Leaderboard[] = (data?.leaderboards ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    faction: parseFactionFromName(l.name),
    matchType: parseMatchTypeFromName(l.name)
  }));
  return { items, lastUpdated: new Date().toISOString() };
}

export async function fetchTop100(leaderboardId: number) {
  const url = `${BASE}/community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=${leaderboardId}&start=1&count=100&sortBy=1`;
  const data = await fetchJsonWithRetry<any>(url, { next: { revalidate: 60 } });

  const groups: RawGroup[] = data?.statGroups ?? [];
  // Some games include a parallel "leaderboardStats" array. Prefer it when present.
  const stats: RawStat[] =
    data?.leaderboardStats ??
    (data?.items ?? []) // fallback if endpoint shape varies
      .map((it: any) => ({
        statgroup_id: it?.statgroup?.id ?? it.statgroup_id,
        rank: it.rank ?? it.position,
        rating: it.rating ?? it.elo ?? it.score,
        wins: it.wins ?? it.win_count ?? 0,
        losses: it.losses ?? it.loss_count ?? 0,
        streak: it.streak ?? 0,
        lastmatchdate: it.lastmatchdate
      }));

  const groupsById = new Map(groups.map(g => [g.id, g]));
  const rows: LadderRow[] = stats
    .filter(s => s?.statgroup_id)
    .map(s => {
      const group = groupsById.get(s.statgroup_id);
      const member = group?.members?.[0];
      const profileId = String(member?.profile_id ?? "");
      const alias = member?.alias?.trim();
      const winrate = (s.wins + s.losses) ? +( (s.wins / (s.wins + s.losses)) * 100 ).toFixed(1) : 0;
      const lastMatchDate = s.lastmatchdate ? new Date(s.lastmatchdate * 1000) : undefined;
      return {
        rank: s.rank ?? 0,
        profileId,
        playerName: alias || "",  // fill later
        rating: s.rating ?? 0,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        winrate,
        streak: s.streak ?? 0,
        country: member?.country,
        lastMatchDate,
      };
    }).filter(r => r.profileId);

  return rows;
}

// Fetch an arbitrary number of rows from a leaderboard (batched by 100)
export async function fetchLeaderboardRows(leaderboardId: number, count: number = 200) {
  const batchSize = 100;
  const concurrentRequests = 5; // Process 5 batches at a time
  const all: LadderRow[] = [];

  // Calculate all batch parameters
  const batches: Array<{start: number, count: number}> = [];
  for (let start = 1; start <= count; start += batchSize) {
    const currentCount = Math.min(batchSize, count - start + 1);
    batches.push({ start, count: currentCount });
  }

  // Process batches in chunks to maintain rate limiting
  for (let i = 0; i < batches.length; i += concurrentRequests) {
    const chunk = batches.slice(i, i + concurrentRequests);

    const chunkResults = await Promise.all(
      chunk.map(async ({ start, count: currentCount }) => {
        const url = `${BASE}/community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=${leaderboardId}&start=${start}&count=${currentCount}&sortBy=1`;
        try {
          const data = await fetchJsonWithRetry<any>(url, { next: { revalidate: 60 } });

          const groups: RawGroup[] = data?.statGroups ?? [];
          const stats: RawStat[] = data?.leaderboardStats ?? [];
          if (!groups.length || !stats.length) return [];

          const groupsById = new Map(groups.map(g => [g.id, g]));
          const rows: LadderRow[] = stats
            .filter(s => s?.statgroup_id)
            .map(s => {
              const group = groupsById.get(s.statgroup_id);
              const member = group?.members?.[0];
              const profileId = String(member?.profile_id ?? "");
              const alias = member?.alias?.trim();
              const winrate = (s.wins + s.losses) ? +(((s.wins / (s.wins + s.losses)) * 100).toFixed(1)) : 0;
              const lastMatchDate = s.lastmatchdate ? new Date(s.lastmatchdate * 1000) : undefined;
              return {
                rank: s.rank ?? 0,
                profileId,
                playerName: alias || "",
                rating: s.rating ?? 0,
                wins: s.wins ?? 0,
                losses: s.losses ?? 0,
                winrate,
                streak: s.streak ?? 0,
                country: member?.country,
                lastMatchDate,
              };
            }).filter(r => r.profileId);
          return rows;
        } catch (error) {
          console.warn(`Failed to fetch leaderboard chunk starting at ${start} (size ${currentCount})`, error);
          return [];
        }
      })
    );

    // Collect all results from this chunk
    chunkResults.forEach(rows => all.push(...rows));

    // Rate limiting delay between chunks (not needed for last chunk)
    if (i + concurrentRequests < batches.length) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  return all;
}

// Fetch all rows (up to a safety cap) for a leaderboard
export async function fetchAllRows(leaderboardId: number, max: number = 10000) {
  return fetchLeaderboardRows(leaderboardId, max);
}

export async function resolveNames(profileIds: string[]): Promise<Record<string, string>> {
  // Chunk to avoid very long URLs and respect rate limits.
  const uniq = Array.from(new Set(profileIds));
  const out: Record<string, string> = {};
  const size = 25;

  for (let i = 0; i < uniq.length; i += size) {
    const ids = uniq.slice(i, i + size);
    const url = `${BASE}/community/external/proxysteamuserrequest?title=dow1-de&request=/ISteamUser/GetPlayerSummaries/v0002/&profile_ids=${ids.join(",")}`;
    const data = await fetchJsonWithRetry<any>(encodeURI(url));
    const players = data?.steamResults?.response?.players ?? [];
    // Some variants also include avatars[] with profile_id→alias; prefer personaname
    for (const p of players) {
      if (p?.relic_profile_id && p?.personaname) out[String(p.relic_profile_id)] = p.personaname;
    }
    await new Promise(r => setTimeout(r, 120)); // soft throttle (≤ ~8 req/s)
  }
  return out;
}

export async function fetchCombined1v1() {
  // First, get all available leaderboards to identify 1v1 race-specific ones
  const { items: leaderboards } = await fetchLeaderboards();
  const oneVsOneLeaderboards = leaderboards.filter(lb =>
    lb.matchType === '1v1' && lb.faction && lb.faction !== 'Unknown'
  );

  // Fetch Top-100 from all 1v1 faction leaderboards in parallel
  const allResults = await Promise.allSettled(
    oneVsOneLeaderboards.map(async (lb) => {
      const rows = await fetchTop100(lb.id);
      // Add faction information to each row
      return rows.map(row => ({
        ...row,
        faction: lb.faction,
        originalRank: row.rank, // Keep original rank for reference
        leaderboardId: lb.id
      }));
    })
  );

  // Collect all successful results
  const allRows: (LadderRow & { originalRank: number; leaderboardId: number })[] = [];
  allResults.forEach(result => {
    if (result.status === 'fulfilled') {
      allRows.push(...result.value);
    }
  });

  // Deduplicate players - keep the version with highest rating
  const playerMap = new Map<string, LadderRow & { originalRank: number; leaderboardId: number }>();

  for (const row of allRows) {
    const existing = playerMap.get(row.profileId);
    if (!existing || row.rating > existing.rating) {
      playerMap.set(row.profileId, row);
    }
  }

  // Convert back to array and sort by rating (descending)
  const deduplicatedRows = Array.from(playerMap.values())
    .sort((a, b) => b.rating - a.rating)
    .map((row, index) => ({
      ...row,
      rank: index + 1 // Re-rank based on combined leaderboard position
    }));

  return deduplicatedRows;
}

export async function fetchCombined1v1Max(maxPerFaction: number = 500) {
  const { items: leaderboards } = await fetchLeaderboards();
  const oneVsOneLeaderboards = leaderboards.filter(lb =>
    lb.matchType === '1v1' && lb.faction && lb.faction !== 'Unknown'
  );

  const allResults = await Promise.allSettled(
    oneVsOneLeaderboards.map(async (lb) => {
      const rows = await fetchAllRows(lb.id, maxPerFaction);
      return rows.map(row => ({
        ...row,
        faction: lb.faction,
        originalRank: row.rank,
        leaderboardId: lb.id
      }));
    })
  );

  const allRows: (LadderRow & { originalRank: number; leaderboardId: number })[] = [];
  allResults.forEach(result => { if (result.status === 'fulfilled') allRows.push(...result.value); });

  const playerMap = new Map<string, LadderRow & { originalRank: number; leaderboardId: number }>();
  for (const row of allRows) {
    const existing = playerMap.get(row.profileId);
    if (!existing || row.rating > existing.rating) playerMap.set(row.profileId, row);
  }

  return Array.from(playerMap.values())
    .sort((a, b) => b.rating - a.rating)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function fetchCombined1v1AllEntries() {
  const { items: leaderboards } = await fetchLeaderboards();
  const oneVsOneLeaderboards = leaderboards.filter(lb =>
    lb.matchType === '1v1' && lb.faction && lb.faction !== 'Unknown'
  );

  const allResults = await Promise.allSettled(
    oneVsOneLeaderboards.map(async (lb) => {
      const rows = await fetchTop100(lb.id);
      return rows.map(row => ({
        ...row,
        faction: lb.faction,
        originalRank: row.rank,
        leaderboardId: lb.id
      }));
    })
  );

  const allRows: (LadderRow & { originalRank: number; leaderboardId: number })[] = [];
  allResults.forEach(result => {
    if (result.status === 'fulfilled') {
      allRows.push(...result.value);
    }
  });

  return allRows
    .sort((a, b) => b.rating - a.rating)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function fetchCombined1v1AllEntriesMax(maxPerFaction: number = 500) {
  const { items: leaderboards } = await fetchLeaderboards();
  const oneVsOneLeaderboards = leaderboards.filter(lb =>
    lb.matchType === '1v1' && lb.faction && lb.faction !== 'Unknown'
  );

  const allResults = await Promise.allSettled(
    oneVsOneLeaderboards.map(async (lb) => {
      const rows = await fetchAllRows(lb.id, maxPerFaction);
      return rows.map(row => ({
        ...row,
        faction: lb.faction,
        originalRank: row.rank,
        leaderboardId: lb.id
      }));
    })
  );

  const allRows: (LadderRow & { originalRank: number; leaderboardId: number })[] = [];
  allResults.forEach(result => {
    if (result.status === 'fulfilled') {
      allRows.push(...result.value);
    }
  });

  return allRows
    .sort((a, b) => b.rating - a.rating)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}
