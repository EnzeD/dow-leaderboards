import { NextResponse } from "next/server";
import { getSupabase, PUBLIC_CACHE_CONTROL } from "@/app/api/stats/helpers";

type SummaryResponse = {
  totalMatches: number;
  generatedAt: string;
  reason?: string;
};

const ERROR_HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  const supabase = getSupabase();
  const generatedAt = new Date().toISOString();

  if (!supabase) {
    return NextResponse.json<SummaryResponse>(
      {
        totalMatches: 0,
        generatedAt,
        reason: "supabase_unavailable",
      },
      { status: 503, headers: ERROR_HEADERS },
    );
  }

  try {
    const { data, error } = await supabase
      .from("stats_summary")
      .select("metric, value, computed_at")
      .eq("metric", "total_1v1_matches")
      .maybeSingle();

    if (error) {
      console.error("[stats] stats_summary query failed", error);
      return NextResponse.json<SummaryResponse>(
        {
          totalMatches: 0,
          generatedAt,
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
      },
      { headers: { "Cache-Control": PUBLIC_CACHE_CONTROL } },
    );
  } catch (error) {
    console.error("[stats] stats_summary unexpected error", error);
    return NextResponse.json<SummaryResponse>(
      {
        totalMatches: 0,
        generatedAt,
        reason: "unexpected_error",
      },
      { status: 500, headers: ERROR_HEADERS },
    );
  }
}
