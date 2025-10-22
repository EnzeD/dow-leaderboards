import { NextRequest, NextResponse } from "next/server";
import { getSupabase, parseIntegerParam, PUBLIC_CACHE_CONTROL, pickAllowedNumber } from "@/app/api/stats/helpers";

type RacePickrateResponse = {
  weeks: number;
  generatedAt: string;
  rows: Array<{
    weekStart: string;
    totalMatches: number;
    factionCounts: Record<string, number>;
  }>;
  reason?: string;
};

const DEFAULT_WEEKS = 12;
const ALLOWED_WEEKS = [6, 12, 24] as const;
const ERROR_HEADERS = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const generatedAt = new Date().toISOString();

  if (!supabase) {
    return NextResponse.json<RacePickrateResponse>(
      {
        weeks: DEFAULT_WEEKS,
        generatedAt,
        rows: [],
        reason: "supabase_unavailable",
      },
      { status: 503, headers: ERROR_HEADERS },
    );
  }

  const url = new URL(req.url);
  const params = url.searchParams;
  const requestedWeeks = parseIntegerParam(params, "weeks", DEFAULT_WEEKS, 6, 52);
  const weeks = pickAllowedNumber(requestedWeeks, ALLOWED_WEEKS, DEFAULT_WEEKS);

  try {
    const { data, error } = await supabase
      .from("stats_race_pickrate")
      .select("week_start, race_id, pick_count, match_count, computed_at")
      .order("week_start", { ascending: true });

    if (error) {
      console.error("[stats] stats_race_pickrate query failed", error);
      return NextResponse.json<RacePickrateResponse>(
        {
          weeks,
          generatedAt,
          rows: [],
          reason: "query_failed",
        },
        { status: 500, headers: ERROR_HEADERS },
      );
    }

    const computedAt =
      data?.[0]?.computed_at && typeof data[0].computed_at === "string"
        ? data[0].computed_at
        : generatedAt;

    const grouped = new Map<string, { weekStart: string; totalMatches: number; factionCounts: Record<string, number> }>();

    for (const row of data ?? []) {
      if (!row?.week_start) continue;
      const key = row.week_start;
      const raceId = row.race_id;
      const pickCount = Number.isFinite(row.pick_count) ? Number(row.pick_count) : 0;
      const matchCount = Number.isFinite(row.match_count) ? Number(row.match_count) : 0;

      const existing = grouped.get(key) ?? {
        weekStart: key,
        totalMatches: matchCount,
        factionCounts: {} as Record<string, number>,
      };
      existing.totalMatches = Math.max(existing.totalMatches, matchCount);

      if (raceId !== null) {
        existing.factionCounts[String(raceId)] = pickCount;
      }

      grouped.set(key, existing);
    }

    const sorted = Array.from(grouped.values()).sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    );
    const rows =
      sorted.length > weeks ? sorted.slice(sorted.length - weeks) : sorted;

    return NextResponse.json<RacePickrateResponse>(
      {
        weeks,
        generatedAt: computedAt,
        rows,
      },
      { headers: { "Cache-Control": PUBLIC_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[stats] stats_race_pickrate unexpected error", error);
    return NextResponse.json<RacePickrateResponse>(
      {
        weeks,
        generatedAt,
        rows: [],
        reason: "unexpected_error",
      },
      { status: 500, headers: ERROR_HEADERS },
    );
  }
}
