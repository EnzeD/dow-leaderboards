import { NextRequest, NextResponse } from "next/server";
import { getSupabase, PUBLIC_CACHE_CONTROL, resolveRatingFloor } from "@/app/api/stats/helpers";

type SummaryResponse = {
  totalMatches: number;
  generatedAt: string;
  ratingFloor: number;
  reason?: string;
};

const ERROR_HEADERS = { "Cache-Control": "no-store" };

export async function GET(req: NextRequest) {
  const supabase = getSupabase();
  const generatedAt = new Date().toISOString();
  const params = new URL(req.url).searchParams;
  const ratingFloor = resolveRatingFloor(params);

  if (!supabase) {
    return NextResponse.json<SummaryResponse>(
      {
        totalMatches: 0,
        generatedAt,
        ratingFloor,
        reason: "supabase_unavailable",
      },
      { status: 503, headers: ERROR_HEADERS },
    );
  }

  try {
    const { data, error } = await supabase
      .from("stats_summary")
      .select("metric, value, computed_at, rating_floor")
      .eq("metric", "total_1v1_matches")
      .eq("rating_floor", ratingFloor)
      .maybeSingle();

    if (error) {
      console.error("[stats] stats_summary query failed", error);
      return NextResponse.json<SummaryResponse>(
        {
          totalMatches: 0,
          generatedAt,
          ratingFloor,
          reason: "query_failed",
        },
        { status: 500, headers: ERROR_HEADERS },
      );
    }

    const totalMatches = data?.value ? Number(data.value) : 0;
    const computedAt =
      data?.computed_at && typeof data.computed_at === "string"
        ? data.computed_at
        : generatedAt;

    return NextResponse.json<SummaryResponse>(
      {
        totalMatches,
        generatedAt: computedAt,
        ratingFloor,
      },
      { headers: { "Cache-Control": PUBLIC_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[stats] stats_summary unexpected error", error);
    return NextResponse.json<SummaryResponse>(
      {
        totalMatches: 0,
        generatedAt,
        ratingFloor,
        reason: "unexpected_error",
      },
      { status: 500, headers: ERROR_HEADERS },
    );
  }
}
