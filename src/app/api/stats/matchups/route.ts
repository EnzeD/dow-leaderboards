import { NextRequest, NextResponse } from "next/server";
import { getSupabase, PUBLIC_CACHE_CONTROL, resolveWindowDays, pickAllowedNumber } from "@/app/api/stats/helpers";

type MatchupsResponse = {
  windowDays: number;
  generatedAt: string;
  rows: Array<{
    myRaceId: number;
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

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const generatedAt = new Date().toISOString();

  if (!supabase) {
    return NextResponse.json<MatchupsResponse>(
      {
        windowDays: 90,
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

  try {
    const { data, error } = await supabase
      .from("stats_matchup_matrix")
      .select(
        "my_race_id, opponent_race_id, matches, wins, losses, winrate, last_played, computed_at",
      )
      .eq("window_days", windowDays);

    if (error) {
      console.error("[stats] stats_matchup_matrix query failed", error);
      return NextResponse.json<MatchupsResponse>(
        {
          windowDays,
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
      .filter(
        row =>
          row.my_race_id !== null && row.opponent_race_id !== null,
      )
      .map(row => ({
        myRaceId: Number(row.my_race_id),
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

    return NextResponse.json<MatchupsResponse>(
      {
        windowDays,
        generatedAt: computedAt,
        rows,
      },
      { headers: { "Cache-Control": PUBLIC_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[stats] stats_matchup_matrix unexpected error", error);
    return NextResponse.json<MatchupsResponse>(
      {
        windowDays,
        generatedAt,
        rows: [],
        reason: "unexpected_error",
      },
      { status: 500, headers: ERROR_HEADERS },
    );
  }
}
