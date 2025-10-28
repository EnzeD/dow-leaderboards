import { NextRequest, NextResponse } from "next/server";
import { getSupabase, PUBLIC_CACHE_CONTROL, resolveWindowDays, pickAllowedNumber, resolveRatingFloor } from "@/app/api/stats/helpers";

type MapRaceResponse = {
  mapIdentifier: string;
  windowDays: number;
  ratingFloor: number;
  generatedAt: string;
  rows: Array<{
    raceId: number;
    matches: number;
    wins: number;
    losses: number;
    winrate: number | null;
    lastPlayed: string | null;
  }>;
  reason?: string;
};

const ERROR_HEADERS = { "Cache-Control": "no-store" };
const ALLOWED_WINDOWS = [30, 90] as const;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = getSupabase();
  const generatedAt = new Date().toISOString();
  const url = new URL(req.url);
  const paramsId = params?.id ?? "";
  const decoded = decodeURIComponent(paramsId);
  const rawIdentifier = decoded.trim();

  if (!rawIdentifier) {
    return NextResponse.json<MapRaceResponse>(
      {
        mapIdentifier: "unknown",
        windowDays: 90,
        ratingFloor: 0,
        generatedAt,
        rows: [],
        reason: "missing_identifier",
      },
      { status: 400, headers: ERROR_HEADERS },
    );
  }

  if (!supabase) {
    return NextResponse.json<MapRaceResponse>(
      {
        mapIdentifier: rawIdentifier,
        windowDays: 90,
        ratingFloor: 0,
        generatedAt,
        rows: [],
        reason: "supabase_unavailable",
      },
      { status: 503, headers: ERROR_HEADERS },
    );
  }

  const requestedWindow = resolveWindowDays(url.searchParams);
  const windowDays = pickAllowedNumber(requestedWindow, ALLOWED_WINDOWS, 90);
  const ratingFloor = resolveRatingFloor(url.searchParams);

  try {
    const { data, error } = await supabase
      .from("stats_map_race_breakdown")
      .select(
        "map_identifier, race_id, matches, wins, losses, winrate, last_played, computed_at, rating_floor",
      )
      .eq("window_days", windowDays)
      .eq("rating_floor", ratingFloor)
      .eq("map_identifier", rawIdentifier)
      .order("matches", { ascending: false });

    if (error) {
      console.error("[stats] stats_map_race_breakdown query failed", error);
      return NextResponse.json<MapRaceResponse>(
        {
          mapIdentifier: rawIdentifier,
          windowDays,
          ratingFloor,
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

    const rows = (data ?? [])
      .filter(row => row.race_id !== null)
      .map(row => ({
        raceId: Number(row.race_id),
        matches: Number.isFinite(row.matches) ? Number(row.matches) : 0,
        wins: Number.isFinite(row.wins) ? Number(row.wins) : 0,
        losses: Number.isFinite(row.losses) ? Number(row.losses) : 0,
        winrate:
          row.winrate === null || row.winrate === undefined
            ? null
            : Number(row.winrate),
        lastPlayed: row.last_played ?? null,
      }));

    const mapIdentifier =
      (data?.[0]?.map_identifier?.trim() ?? "") ||
      rawIdentifier ||
      "unknown";

    return NextResponse.json<MapRaceResponse>(
      {
        mapIdentifier,
        windowDays,
        ratingFloor,
        generatedAt: computedAt,
        rows,
      },
      { headers: { "Cache-Control": PUBLIC_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[stats] stats_map_race_breakdown unexpected error", error);
    return NextResponse.json<MapRaceResponse>(
      {
        mapIdentifier: rawIdentifier,
        windowDays,
        ratingFloor,
        generatedAt,
        rows: [],
        reason: "unexpected_error",
      },
      { status: 500, headers: ERROR_HEADERS },
    );
  }
}
