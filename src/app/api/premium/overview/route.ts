import { NextRequest, NextResponse } from "next/server";
import {
  attachCacheHeaders,
  getSupabaseAdmin,
  resolveActivationStatus,
} from "@/lib/premium/activation-server";

interface OverviewRow {
  profile_id: string | number;
  total_matches: number;
  matches_last_7_days: number;
  total_wins: number;
  total_losses: number;
  winrate: string | number | null;
  last_xp_sync: string | null;
}

interface OverviewResponse {
  activated: boolean;
  profileId: string;
  totals?: {
    matches: number;
    matchesLast7Days: number;
    leaderboardWins: number;
    leaderboardLosses: number;
    leaderboardTotal: number;
    leaderboardWinrate: number | null;
  };
  lastXpSync?: string | null;
  reason?: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const profileIdRaw = url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const profileId = profileIdRaw?.trim();

  if (!profileId) {
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>({
        activated: false,
        profileId: "",
        reason: "missing_profile",
      }, { status: 400 })
    );
  }

  const activation = await resolveActivationStatus(profileId);
  if (!activation.activated) {
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>({
        activated: false,
        profileId,
        reason: activation.reason,
      }, { status: 403 })
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>({
        activated: false,
        profileId,
        reason: "supabase_not_configured",
      }, { status: 503 })
    );
  }

  try {
    const { data, error } = await supabase.rpc("premium_get_profile_overview", {
      p_profile_id: profileId,
    }).maybeSingle();

    if (error) {
      console.error("[premium] overview rpc failed", error);
      return attachCacheHeaders(
        NextResponse.json<OverviewResponse>({
          activated: true,
          profileId,
          reason: "rpc_failed",
        }, { status: 500 })
      );
    }

    const typedData = data as OverviewRow | null;

    if (!typedData) {
      return attachCacheHeaders(
        NextResponse.json<OverviewResponse>({
          activated: true,
          profileId,
          totals: {
            matches: 0,
            matchesLast7Days: 0,
            leaderboardWins: 0,
            leaderboardLosses: 0,
            leaderboardTotal: 0,
            leaderboardWinrate: null,
          },
          lastXpSync: null,
        })
      );
    }

    const wins = Number(typedData.total_wins ?? 0);
    const losses = Number(typedData.total_losses ?? 0);
    const totalLeaderboardMatches = wins + losses;

    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>({
        activated: true,
        profileId,
        totals: {
          matches: Number(typedData.total_matches ?? 0),
          matchesLast7Days: Number(typedData.matches_last_7_days ?? 0),
          leaderboardWins: wins,
          leaderboardLosses: losses,
          leaderboardTotal: totalLeaderboardMatches,
          leaderboardWinrate: typedData.winrate === null || typedData.winrate === undefined ? null : Number(typedData.winrate),
        },
        lastXpSync: typedData.last_xp_sync ?? null,
      })
    );
  } catch (error) {
    console.error("[premium] overview unexpected error", error);
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>({
        activated: true,
        profileId,
        reason: "unexpected_error",
      }, { status: 500 })
    );
  }
}

