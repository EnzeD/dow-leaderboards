import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auth0 } from "@/lib/auth0";
import {
  attachCacheHeaders,
  fetchSubscriptionSnapshot,
  getSupabaseAdmin,
  isStripeSubscriptionActive,
} from "@/lib/premium/subscription-server";
import { fetchLeaderboards, fetchLeaderboardRows, type Leaderboard, parseFactionFromName } from "@/lib/relic";
import {
  getForcedAdvancedStatsProfileId,
  getForcedAdvancedStatsProfileIdNumber,
} from "@/lib/premium/force-advanced-stats";

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
    mainRace: string | null;
    mainRacePercentage: number | null;
  };
  reason?: string;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const requestedProfileIdRaw =
    url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const requestedProfileId = requestedProfileIdRaw?.trim() ?? null;

  const buildOverviewResponse = async (
    supabaseClient: SupabaseClient,
    profileNumeric: number,
  ) => {
    const profileId = String(profileNumeric);

    try {
      const { items: leaderboards } = await fetchLeaderboards();
      const nonCustomLeaderboards = leaderboards.filter((lb: Leaderboard) =>
        !lb.name?.toLowerCase().includes("custom"),
      );

      let totalWins = 0;
      let totalLosses = 0;
      const raceMatchCounts: Record<string, number> = {};

      for (const leaderboard of nonCustomLeaderboards) {
        try {
          const rows = await fetchLeaderboardRows(leaderboard.id, 200);
          const playerStat = rows.find((s: any) => String(s.profileId) === profileId);

          if (playerStat) {
            totalWins += playerStat.wins || 0;
            totalLosses += playerStat.losses || 0;

            const race = parseFactionFromName(leaderboard.name || "");
            if (race) {
              const matches = (playerStat.wins || 0) + (playerStat.losses || 0);
              raceMatchCounts[race] = (raceMatchCounts[race] || 0) + matches;
            }
          }
        } catch (err) {
          console.warn(`Failed to fetch stats for leaderboard ${leaderboard.id}:`, err);
        }
      }

      const totalLeaderboardMatches = totalWins + totalLosses;
      const winrate =
        totalLeaderboardMatches > 0 ? totalWins / totalLeaderboardMatches : null;

      let mainRace: string | null = null;
      let mainRacePercentage: number | null = null;

      if (totalLeaderboardMatches > 0) {
        const races = Object.entries(raceMatchCounts);
        if (races.length > 0) {
          const [race, count] = races.reduce((max, current) =>
            current[1] > max[1] ? current : max,
          );
          mainRace = race;
          mainRacePercentage = count / totalLeaderboardMatches;
        }
      }

      const { data: matchData } = await supabaseClient
        .from("match_participants")
        .select("match_id, matches!inner(completed_at)")
        .eq("profile_id", profileNumeric)
        .eq("is_computer", false);

      const totalMatches = matchData?.length || 0;
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const matchesLast7Days =
        matchData?.filter(
          (m: any) => m.matches?.completed_at && m.matches.completed_at >= sevenDaysAgo,
        ).length || 0;

      const { data: playerData } = await supabaseClient
        .from("players")
        .select("last_seen_at, updated_at")
        .eq("profile_id", profileNumeric)
        .maybeSingle();

      const lastXpSync = playerData
        ? (playerData.last_seen_at > playerData.updated_at
            ? playerData.last_seen_at
            : playerData.updated_at)
        : null;
      void lastXpSync;

      return attachCacheHeaders(
        NextResponse.json<OverviewResponse>({
          activated: true,
          profileId,
          totals: {
            matches: totalMatches,
            matchesLast7Days,
            leaderboardWins: totalWins,
            leaderboardLosses: totalLosses,
            leaderboardTotal: totalLeaderboardMatches,
            leaderboardWinrate: winrate,
            mainRace,
            mainRacePercentage,
          },
        }),
      );
    } catch (error) {
      console.error("[premium] overview unexpected error", error);
      return attachCacheHeaders(
        NextResponse.json<OverviewResponse>(
          {
            activated: true,
            profileId,
            reason: "unexpected_error",
          },
          { status: 500 },
        ),
      );
    }
  };

  const forcedProfileId = getForcedAdvancedStatsProfileId();
  const forcedProfileIdNumber = getForcedAdvancedStatsProfileIdNumber();
  const isForcedRequest =
    Boolean(
      forcedProfileId &&
      forcedProfileIdNumber !== null &&
      (!requestedProfileId || requestedProfileId === forcedProfileId),
    );

  if (isForcedRequest) {
    if (forcedProfileIdNumber === null) {
      return attachCacheHeaders(
        NextResponse.json<OverviewResponse>(
          {
            activated: false,
            profileId: "",
            reason: "invalid_forced_profile",
          },
          { status: 400 },
        ),
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return attachCacheHeaders(
        NextResponse.json<OverviewResponse>(
          {
            activated: false,
            profileId: "",
            reason: "supabase_unavailable",
          },
          { status: 503 },
        ),
      );
    }

    return buildOverviewResponse(supabase, forcedProfileIdNumber);
  }

  const session = await auth0.getSession();
  if (!session) {
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>(
        {
          activated: false,
          profileId: "",
          reason: "not_authenticated",
        },
        { status: 401 },
      ),
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>(
        {
          activated: false,
          profileId: "",
          reason: "supabase_unavailable",
        },
        { status: 503 },
      ),
    );
  }

  const auth0Sub = session.user.sub;
  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("primary_profile_id")
    .eq("auth0_sub", auth0Sub)
    .maybeSingle();

  if (appUserError) {
    console.error("[premium] overview failed to load app_user", appUserError);
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>(
        {
          activated: false,
          profileId: "",
          reason: "lookup_failed",
        },
        { status: 500 },
      ),
    );
  }

  const primaryProfileId = appUser?.primary_profile_id
    ? Number.parseInt(String(appUser.primary_profile_id), 10)
    : null;

  if (!primaryProfileId) {
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>(
        {
          activated: false,
          profileId: "",
          reason: "profile_not_linked",
        },
        { status: 403 },
      ),
    );
  }

  if (
    requestedProfileId &&
    Number.parseInt(requestedProfileId, 10) !== primaryProfileId
  ) {
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>(
        {
          activated: false,
          profileId: String(primaryProfileId),
          reason: "profile_mismatch",
        },
        { status: 403 },
      ),
    );
  }

  const subscription = await fetchSubscriptionSnapshot(supabase, auth0Sub);
  if (!isStripeSubscriptionActive(subscription)) {
    return attachCacheHeaders(
      NextResponse.json<OverviewResponse>(
        {
          activated: false,
          profileId: String(primaryProfileId),
          reason: "not_subscribed",
        },
        { status: 403 },
      ),
    );
  }

  return buildOverviewResponse(supabase, primaryProfileId);
}
