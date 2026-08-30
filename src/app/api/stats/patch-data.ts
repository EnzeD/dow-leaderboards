import { unstable_cache } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { GAME_PATCH_HISTORY_VERIFIED_THROUGH, KNOWN_GAME_PATCHES, parseSteamGamePatches, STEAM_NEWS_URL } from "@/lib/replay-game-version";
import {
  aggregateStatsOutcomes,
  aggregateStatsPickrates,
  buildStatsPatchPeriods,
  type GamePatch,
  type StatsDailyRow,
  type StatsDimension,
  type StatsPatchPeriod,
} from "@/lib/stats-patches";
import { getSupabase, parseIntegerParam, PUBLIC_CACHE_CONTROL, resolveRatingFloor } from "./helpers";

const ERROR_HEADERS = { "Cache-Control": "no-store" };

// A cached read for Stats; the separate replay-upload check remains uncached.
const loadSteamPatches = unstable_cache(async () => {
  const response = await fetch(STEAM_NEWS_URL, { cache: "no-store", signal: AbortSignal.timeout(2000) });
  if (!response.ok) throw new Error("steam_unavailable");
  const livePatches = parseSteamGamePatches(await response.json());
  if (!livePatches.length) throw new Error("steam_patches_missing");
  const patches = new Map<string, GamePatch>(KNOWN_GAME_PATCHES.map(patch => [patch.version, patch]));
  for (const patch of livePatches) patches.set(patch.version, patch);
  return { patches: Array.from(patches.values()), verifiedThrough: new Date().toISOString() };
}, ["stats-steam-patches-v1"], { revalidate: 3600 });

export async function getStatsPatchCatalog() {
  try {
    const catalog = await loadSteamPatches();
    return {
      patches: buildStatsPatchPeriods(catalog.patches, catalog.verifiedThrough),
      stale: Date.now() - Date.parse(catalog.verifiedThrough) > 3_600_000,
    };
  } catch {
    // Do not extend the final known patch indefinitely when Steam is unavailable.
    return {
      patches: buildStatsPatchPeriods(KNOWN_GAME_PATCHES, GAME_PATCH_HISTORY_VERIFIED_THROUGH),
      stale: true,
    };
  }
}

const SOURCES = {
  summary: { table: "stats_daily_summary", dimensions: [] },
  maps: { table: "stats_daily_map_overview", dimensions: ["map_identifier"] },
  races: { table: "stats_daily_race_pickrate", dimensions: ["race_id"] },
  matchups: { table: "stats_daily_matchup_matrix", dimensions: ["my_race_id", "opponent_race_id"] },
  mapRaces: { table: "stats_daily_map_race_breakdown", dimensions: ["map_identifier", "race_id"] },
  mapMatchups: { table: "stats_daily_map_race_matchups", dimensions: ["map_identifier", "my_race_id", "opponent_race_id"] },
} as const;

type StatsKind = keyof typeof SOURCES;
type DetailFilter = { mapIdentifier?: string; raceId?: number };

async function readPatchDays(
  supabase: SupabaseClient,
  kind: StatsKind,
  period: StatsPatchPeriod,
  ratingFloor: number,
  detail: DetailFilter,
): Promise<StatsDailyRow[]> {
  if (period.startDay >= period.endDay) return [];
  const source = SOURCES[kind];
  const rows: StatsDailyRow[] = [];
  const pageSize = 500;
  // Supabase caps responses; paginate in full primary-key order before summing.
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    let query = supabase.from(source.table).select("*")
      .eq("rating_floor", ratingFloor)
      .gte("match_day", period.startDay).lt("match_day", period.endDay)
      .order("match_day", { ascending: true });
    for (const column of source.dimensions) query = query.order(column, { ascending: true });
    if (detail.mapIdentifier !== undefined) query = query.eq("map_identifier", detail.mapIdentifier);
    if (detail.raceId !== undefined) query = query.eq("my_race_id", detail.raceId);
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as StatsDailyRow[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error("patch_stats_row_limit");
}

/** Return null for unfiltered requests, preserving the existing Stats API. */
export async function getPatchStatsResponse(req: NextRequest, kind: StatsKind, detail: DetailFilter = {}) {
  const params = new URL(req.url).searchParams;
  const version = params.get("patch");
  if (!version || version === "all") return null;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return NextResponse.json({ reason: "invalid_patch" }, { status: 400, headers: ERROR_HEADERS });
  }

  try {
    const catalog = await getStatsPatchCatalog();
    const patch = catalog.patches.find(item => item.version === version);
    if (!patch) return NextResponse.json({ reason: "unknown_patch" }, { status: 400, headers: ERROR_HEADERS });
    const supabase = getSupabase();
    if (!supabase) return NextResponse.json({ reason: "supabase_unavailable" }, { status: 503, headers: ERROR_HEADERS });

    const ratingFloor = resolveRatingFloor(params);
    const daily = await readPatchDays(supabase, kind, patch, ratingFloor, detail);
    const generatedAt = daily.reduce((latest, row) => {
      return row.computed_at && (!latest || Date.parse(row.computed_at) > Date.parse(latest)) ? row.computed_at : latest;
    }, "") || new Date().toISOString();
    const metadata = { patch, ratingFloor, generatedAt, catalogStale: catalog.stale, windowDays: null };
    let payload;
    if (kind === "summary") {
      payload = { ...metadata, totalMatches: daily.reduce((total, row) => total + (row.matches ?? 0), 0) };
    } else if (kind === "races") {
      const rows = aggregateStatsPickrates(daily);
      payload = { ...metadata, weeks: rows.length, rows };
    } else {
      const groups = aggregateStatsOutcomes(daily, SOURCES[kind].dimensions as readonly StatsDimension[]);
      const limit = kind === "maps" ? parseIntegerParam(params, "limit", 30, 5, 60) : groups.length;
      const rows = groups.slice(0, limit).map(row => ({
        ...(kind === "maps" ? { mapIdentifier: row.map_identifier, mapName: row.map_name || "Unknown Map" } : {}),
        ...(kind === "mapRaces" ? { raceId: row.race_id } : {}),
        ...(kind === "matchups" ? { myRaceId: row.my_race_id } : {}),
        ...(kind === "matchups" || kind === "mapMatchups" ? { opponentRaceId: row.opponent_race_id } : {}),
        matches: row.matches, wins: row.wins, losses: row.losses,
        winrate: row.winrate, lastPlayed: row.last_played ?? null,
      }));
      payload = { ...metadata, ...detail, ...(kind === "maps" ? { limit } : {}), rows };
    }
    return NextResponse.json(payload, {
      headers: { "Cache-Control": catalog.stale ? "no-store" : PUBLIC_CACHE_CONTROL },
    });
  } catch (error) {
    console.error(`[stats] patch ${kind} query failed`, error);
    return NextResponse.json({ reason: "patch_query_failed" }, { status: 500, headers: ERROR_HEADERS });
  }
}
