const BASE = "https://dow-api.reliclink.com";

type RawGroup = { id: number, members: Array<{ profile_id: number, alias?: string, country?: string }> };
type RawStat = { statgroup_id: number, rank: number, rating: number, wins: number, losses: number, streak: number, lastmatchdate?: number };

export type LadderRow = {
  rank: number; profileId: string; playerName: string;
  rating: number; wins: number; losses: number; winrate: number; streak: number;
  country?: string; lastMatchDate?: Date;
};

export type Leaderboard = {
  id: number;
  name: string;
  faction?: string;
  matchType?: string;
};

// Faction and match type parsing utilities
export function parseFactionFromName(name: string): string {
  if (name.includes('chaos_marine')) return 'Chaos Marine';
  if (name.includes('dark_eldar')) return 'Dark Eldar';
  if (name.includes('eldar') && !name.includes('dark')) return 'Eldar';
  if (name.includes('guard')) return 'Imperial Guard';
  if (name.includes('necron')) return 'Necron';
  if (name.includes('ork')) return 'Ork';
  if (name.includes('sisters')) return 'Sisters of Battle';
  if (name.includes('space_marine')) return 'Space Marine';
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

export async function fetchLeaderboards() {
  const url = `${BASE}/community/leaderboard/GetAvailableLeaderboards?title=dow1-de`;
  const data = await fetch(url, { cache: "force-cache" }).then(r => r.json());
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
  const data = await fetch(url, { cache: "no-store" }).then(r => r.json());

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

export async function resolveNames(profileIds: string[]): Promise<Record<string, string>> {
  // Chunk to avoid very long URLs and respect rate limits.
  const uniq = Array.from(new Set(profileIds));
  const out: Record<string, string> = {};
  const size = 25;

  for (let i = 0; i < uniq.length; i += size) {
    const ids = uniq.slice(i, i + size);
    const url = `${BASE}/community/external/proxysteamuserrequest?title=dow1-de&request=/ISteamUser/GetPlayerSummaries/v0002/&profile_ids=${ids.join(",")}`;
    const data = await fetch(encodeURI(url)).then(r => r.json());
    const players = data?.steamResults?.response?.players ?? [];
    // Some variants also include avatars[] with profile_id→alias; prefer personaname
    for (const p of players) {
      if (p?.relic_profile_id && p?.personaname) out[String(p.relic_profile_id)] = p.personaname;
    }
    await new Promise(r => setTimeout(r, 120)); // soft throttle (≤ ~8 req/s)
  }
  return out;
}