export type GamePatch = { version: string; announcedAt: string };

export type StatsPatchPeriod = GamePatch & {
  startDay: string;
  /** Exclusive: release days and the unfinished current UTC day are omitted. */
  endDay: string;
};

const DAY_MS = 86_400_000;
const dayString = (time: number) => new Date(time).toISOString().slice(0, 10);

/** Daily rollups cannot split a release day between two different patches. */
export function buildStatsPatchPeriods(
  patches: readonly GamePatch[],
  verifiedThrough: string,
  now = Date.now(),
): StatsPatchPeriod[] {
  const cutoff = Math.floor(Math.min(now, Date.parse(verifiedThrough)) / DAY_MS) * DAY_MS;
  const sorted = patches
    .filter(patch => Number.isFinite(Date.parse(patch.announcedAt)) && Date.parse(patch.announcedAt) <= now)
    .slice().sort((a, b) => Date.parse(a.announcedAt) - Date.parse(b.announcedAt));

  return sorted.map((patch, index) => {
    const start = Math.ceil(Date.parse(patch.announcedAt) / DAY_MS) * DAY_MS;
    const next = sorted[index + 1];
    const end = next ? Math.min(cutoff, Math.floor(Date.parse(next.announcedAt) / DAY_MS) * DAY_MS) : cutoff;
    return { ...patch, startDay: dayString(start), endDay: dayString(Math.max(start, end)) };
  });
}

export type StatsDailyRow = {
  match_day: string;
  matches?: number;
  wins?: number;
  losses?: number;
  last_played?: string | null;
  computed_at?: string;
  map_identifier?: string;
  map_name?: string;
  race_id?: number;
  my_race_id?: number;
  opponent_race_id?: number;
  pick_count?: number;
  match_count?: number;
};

export type StatsDimension = "map_identifier" | "race_id" | "my_race_id" | "opponent_race_id";

/** Sum counts before calculating rates; never average daily percentages. */
export function aggregateStatsOutcomes(rows: StatsDailyRow[], dimensions: readonly StatsDimension[]) {
  const groups = new Map<string, StatsDailyRow & { matches: number; wins: number; losses: number }>();
  for (const row of rows) {
    const key = JSON.stringify(dimensions.map(dimension => row[dimension]));
    const group = groups.get(key) ?? { ...row, matches: 0, wins: 0, losses: 0 };
    group.matches += row.matches ?? 0;
    group.wins += row.wins ?? 0;
    group.losses += row.losses ?? 0;
    if (row.last_played && (!group.last_played || Date.parse(row.last_played) > Date.parse(group.last_played))) {
      group.last_played = row.last_played;
    }
    groups.set(key, group);
  }
  return Array.from(groups.values()).map(row => ({
    ...row,
    winrate: row.matches > 0 ? row.wins / row.matches : null,
  })).sort((a, b) => b.matches - a.matches);
}

/** Filter days first, then bucket into UTC Monday weeks (including partial weeks). */
export function aggregateStatsPickrates(rows: StatsDailyRow[]) {
  const weeks = new Map<string, { weekStart: string; totalMatches: number; factionCounts: Record<string, number> }>();
  const daysSeen = new Set<string>();
  for (const row of rows) {
    const date = new Date(`${row.match_day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
    const key = date.toISOString().slice(0, 10);
    const week = weeks.get(key) ?? { weekStart: key, totalMatches: 0, factionCounts: {} as Record<string, number> };
    // match_count is repeated for each faction in the daily rollup.
    if (!daysSeen.has(row.match_day)) {
      week.totalMatches += row.match_count ?? 0;
      daysSeen.add(row.match_day);
    }
    if (row.race_id !== undefined) {
      const race = String(row.race_id);
      week.factionCounts[race] = (week.factionCounts[race] ?? 0) + (row.pick_count ?? 0);
    }
    weeks.set(key, week);
  }
  return Array.from(weeks.values()).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}
