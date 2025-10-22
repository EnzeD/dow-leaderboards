import { NextRequest, NextResponse } from "next/server";
import { getSupabase, parseIntegerParam, PUBLIC_CACHE_CONTROL, resolveWindowDays, pickAllowedNumber } from "@/app/api/stats/helpers";

type MapsResponse = {
  windowDays: number;
  limit: number;
  generatedAt: string;
  rows: Array<{
    mapIdentifier: string;
    mapName: string;
    matches: number;
    wins: number;
    losses: number;
    winrate: number | null;
    lastPlayed: string | null;
  }>;
  reason?: string;
};

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 60;
const ALLOWED_WINDOWS = [30, 90] as const;
const ERROR_HEADERS = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const generatedAt = new Date().toISOString();

  if (!supabase) {
    return NextResponse.json<MapsResponse>(
      {
        windowDays: 90,
        limit: DEFAULT_LIMIT,
        generatedAt,
        rows: [],
        reason: "supabase_unavailable",
      },
      { status: 503, headers: ERROR_HEADERS },
    );
  }

  const url = new URL(req.url);
  const params = url.searchParams;
  const requestedWindow = resolveWindowDays(params);
  const windowDays = pickAllowedNumber(requestedWindow, ALLOWED_WINDOWS, 90);
  const limit = parseIntegerParam(params, "limit", DEFAULT_LIMIT, 5, MAX_LIMIT);

  try {
    const { data, error } = await supabase
      .from("stats_map_overview")
      .select(
        "map_identifier, map_name, matches, wins, losses, winrate, last_played, computed_at",
      )
      .eq("window_days", windowDays)
      .order("matches", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[stats] stats_map_overview query failed", error);
      return NextResponse.json<MapsResponse>(
        {
          windowDays,
          limit,
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

    const rows = (data ?? []).map(row => ({
      mapIdentifier: row.map_identifier?.trim() || "unknown",
      mapName: row.map_name?.trim() || "Unknown Map",
      matches: Number.isFinite(row.matches) ? Number(row.matches) : 0,
      wins: Number.isFinite(row.wins) ? Number(row.wins) : 0,
      losses: Number.isFinite(row.losses) ? Number(row.losses) : 0,
      winrate:
        row.winrate === null || row.winrate === undefined
          ? null
          : Number(row.winrate),
      lastPlayed: row.last_played ?? null,
    }));

    return NextResponse.json<MapsResponse>(
      {
        windowDays,
        limit,
        generatedAt: computedAt,
        rows,
      },
      { headers: { "Cache-Control": PUBLIC_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[stats] stats_map_overview unexpected error", error);
    return NextResponse.json<MapsResponse>(
      {
        windowDays,
        limit,
        generatedAt,
        rows: [],
        reason: "unexpected_error",
      },
      { status: 500, headers: ERROR_HEADERS },
    );
  }
}
