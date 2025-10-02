import { NextRequest, NextResponse } from "next/server";
import {
  attachCacheHeaders,
  getSupabaseAdmin,
  resolveActivationStatus,
  resolveSinceDate,
} from "@/lib/premium/activation-server";

interface EloHistoryRow {
  snapshot_at: string;
  leaderboard_id: number;
  rating: number | null;
  rank: number | null;
  rank_total: number | null;
}

interface EloHistoryResponse {
  activated: boolean;
  profileId: string;
  leaderboardId?: number;
  windowStart: string;
  generatedAt: string;
  samples: Array<{
    timestamp: string;
    leaderboardId: number;
    rating: number | null;
    rank: number | null;
    rankTotal: number | null;
  }>;
  reason?: string;
}

const DEFAULT_LIMIT = 200;

const coerceInt = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const profileIdRaw = url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const profileId = profileIdRaw?.trim();

  if (!profileId) {
    return attachCacheHeaders(
      NextResponse.json({
        activated: false,
        profileId: "",
        samples: [],
        reason: "missing_profile",
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
      }, { status: 400 })
    );
  }

  const activation = await resolveActivationStatus(profileId);
  if (!activation.activated) {
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: false,
        profileId,
        samples: [],
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        reason: activation.reason,
      }, { status: 403 })
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: false,
        profileId,
        samples: [],
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        reason: "supabase_not_configured",
      }, { status: 503 })
    );
  }

  const leaderboardParam = url.searchParams.get("leaderboardId") ?? url.searchParams.get("leaderboard_id");
  const leaderboardParsed = leaderboardParam ? Number.parseInt(leaderboardParam, 10) : undefined;
  const leaderboardId = Number.isFinite(leaderboardParsed) ? leaderboardParsed : undefined;
  const windowDays = coerceInt(url.searchParams.get("windowDays") ?? url.searchParams.get("window"), 90);
  const limit = coerceInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
  const windowStart = resolveSinceDate(windowDays);

  try {
    const { data, error } = await supabase.rpc<EloHistoryRow>("premium_get_elo_history", {
      p_profile_id: profileId,
      p_leaderboard_id: typeof leaderboardId === "number" ? leaderboardId : null,
      p_since: windowStart,
      p_limit: limit,
    });

    if (error) {
      console.error("[premium] elo history rpc failed", error);
      return attachCacheHeaders(
        NextResponse.json<EloHistoryResponse>({
          activated: true,
          profileId,
          leaderboardId,
          windowStart,
          generatedAt: new Date().toISOString(),
          samples: [],
          reason: "rpc_failed",
        }, { status: 500 })
      );
    }

    const samples = (data ?? []).map((row) => ({
      timestamp: row.snapshot_at,
      leaderboardId: row.leaderboard_id,
      rating: row.rating,
      rank: row.rank,
      rankTotal: row.rank_total,
    }));

    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: true,
        profileId,
        leaderboardId,
        windowStart,
        generatedAt: new Date().toISOString(),
        samples,
      })
    );
  } catch (error) {
    console.error("[premium] elo history unexpected error", error);
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: true,
        profileId,
        leaderboardId,
        windowStart,
        generatedAt: new Date().toISOString(),
        samples: [],
        reason: "unexpected_error",
      }, { status: 500 })
    );
  }
}
