import { NextRequest, NextResponse } from "next/server";
import {
  getSupabase,
  PUBLIC_CACHE_CONTROL,
  resolveWindowDays,
  pickAllowedNumber,
  resolveRatingFloor,
} from "@/app/api/stats/helpers";

type MapRaceMatchupsResponse = {
  mapIdentifier: string;
  raceId: number;
  windowDays: number;
  ratingFloor: number;
  generatedAt: string;
  rows: Array<{
    opponentRaceId: number;
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

type SupabaseMatchupRow = {
  opponent_race_id: number | null;
  matches: number | null;
  wins: number | null;
  losses: number | null;
  winrate: number | null;
  last_played: string | null;
  computed_at?: string | null;
};

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; raceId: string } },
) {
  const supabase = getSupabase();
  const generatedAt = new Date().toISOString();
  const { id = "", raceId = "" } = params ?? {};

  const decodedMapId = decodeURIComponent(id ?? "").trim();
  const parsedRaceId = Number(raceId);
  const searchParams = new URL(req.url).searchParams;

  if (!decodedMapId) {
    return NextResponse.json<MapRaceMatchupsResponse>(
      {
        mapIdentifier: "unknown",
        raceId: Number.isFinite(parsedRaceId) ? parsedRaceId : -1,
        windowDays: 90,
        ratingFloor: 0,
        generatedAt,
        rows: [],
        reason: "missing_identifier",
      },
      { status: 400, headers: ERROR_HEADERS },
    );
  }

  if (!Number.isFinite(parsedRaceId)) {
    return NextResponse.json<MapRaceMatchupsResponse>(
      {
        mapIdentifier: decodedMapId,
        raceId: -1,
        windowDays: 90,
        ratingFloor: 0,
        generatedAt,
        rows: [],
        reason: "invalid_race_id",
      },
      { status: 400, headers: ERROR_HEADERS },
    );
  }

  if (!supabase) {
    return NextResponse.json<MapRaceMatchupsResponse>(
      {
        mapIdentifier: decodedMapId,
        raceId: parsedRaceId,
        windowDays: 90,
        ratingFloor: 0,
        generatedAt,
        rows: [],
        reason: "supabase_unavailable",
      },
      { status: 503, headers: ERROR_HEADERS },
    );
  }

  const requestedWindow = resolveWindowDays(searchParams);
  const windowDays = pickAllowedNumber(requestedWindow, ALLOWED_WINDOWS, 90);
  const ratingFloor = resolveRatingFloor(searchParams);

  try {
    const { data, error } = await supabase
      .from("stats_map_race_matchups")
      .select(
        "opponent_race_id, matches, wins, losses, winrate, last_played, computed_at, rating_floor",
      )
      .eq("window_days", windowDays)
      .eq("rating_floor", ratingFloor)
      .eq("map_identifier", decodedMapId)
      .eq("my_race_id", parsedRaceId)
      .order("matches", { ascending: false })
      .limit(20);

    if (error) {
      console.error("[stats] stats_map_race_matchups query failed", error);
      return NextResponse.json<MapRaceMatchupsResponse>(
        {
          mapIdentifier: decodedMapId,
          raceId: parsedRaceId,
          windowDays,
          ratingFloor,
          generatedAt,
          rows: [],
          reason: "query_failed",
        },
        { status: 500, headers: ERROR_HEADERS },
      );
    }

    const typedData = (data as SupabaseMatchupRow[] | null) ?? [];

    const rows = typedData
      .filter(row => row?.opponent_race_id !== null)
      .map(row => ({
        opponentRaceId: Number(row.opponent_race_id),
        matches: Number.isFinite(row.matches) ? Number(row.matches) : 0,
        wins: Number.isFinite(row.wins) ? Number(row.wins) : 0,
        losses: Number.isFinite(row.losses) ? Number(row.losses) : 0,
        winrate:
          row.winrate === null || row.winrate === undefined
            ? null
            : Number(row.winrate),
        lastPlayed: row.last_played ?? null,
      }));

    return NextResponse.json<MapRaceMatchupsResponse>(
      {
        mapIdentifier: decodedMapId,
        raceId: parsedRaceId,
        windowDays,
        ratingFloor,
        generatedAt:
          typedData?.[0]?.computed_at && typeof typedData[0].computed_at === "string"
            ? typedData[0].computed_at
            : generatedAt,
        rows,
      },
      { headers: { "Cache-Control": PUBLIC_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[stats] stats_get_map_race_matchups unexpected error", error);
    return NextResponse.json<MapRaceMatchupsResponse>(
      {
        mapIdentifier: decodedMapId,
        raceId: parsedRaceId,
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
