import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auth0 } from "@/lib/auth0";
import {
  attachCacheHeaders,
  fetchSubscriptionSnapshot,
  getSupabaseAdmin,
  isStripeSubscriptionActive,
  resolveSinceDate,
} from "@/lib/premium/subscription-server";
import {
  getForcedAdvancedStatsProfileId,
  getForcedAdvancedStatsProfileIdNumber,
} from "@/lib/premium/force-advanced-stats";

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
  const requestedProfileIdRaw =
    url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const requestedProfileId = requestedProfileIdRaw?.trim() ?? null;

  const leaderboardParam =
    url.searchParams.get("leaderboardId") ?? url.searchParams.get("leaderboard_id");
  const leaderboardParsed = leaderboardParam
    ? Number.parseInt(leaderboardParam, 10)
    : undefined;
  const leaderboardId = Number.isFinite(leaderboardParsed)
    ? leaderboardParsed
    : undefined;
  const windowDays = coerceInt(
    url.searchParams.get("windowDays") ?? url.searchParams.get("window"),
    90,
  );
  const limit = coerceInt(url.searchParams.get("limit"), DEFAULT_LIMIT);
  const windowStart = resolveSinceDate(windowDays);

  const buildResponse = async (
    supabaseClient: SupabaseClient,
    profileNumeric: number,
  ) => {
    const profileId = String(profileNumeric);

    try {
      const { data, error } = await supabaseClient.rpc("premium_get_elo_history", {
        p_profile_id: profileNumeric,
        p_leaderboard_id: typeof leaderboardId === "number" ? leaderboardId : null,
        p_since: windowStart,
        p_limit: limit,
      });

      if (error) {
        console.error("[premium] elo history rpc failed", error);
        return attachCacheHeaders(
          NextResponse.json<EloHistoryResponse>(
            {
              activated: true,
              profileId,
              leaderboardId,
              windowStart,
              generatedAt: new Date().toISOString(),
              samples: [],
              reason: "rpc_failed",
            },
            { status: 500 },
          ),
        );
      }

      const samples = ((data as EloHistoryRow[]) ?? []).map((row: EloHistoryRow) => ({
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
        }),
      );
    } catch (error) {
      console.error("[premium] elo history unexpected error", error);
      return attachCacheHeaders(
        NextResponse.json<EloHistoryResponse>(
          {
            activated: true,
            profileId,
            leaderboardId,
            windowStart,
            generatedAt: new Date().toISOString(),
            samples: [],
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
        NextResponse.json<EloHistoryResponse>(
          {
            activated: false,
            profileId: "",
            samples: [],
            reason: "invalid_forced_profile",
            windowStart,
            generatedAt: new Date().toISOString(),
          },
          { status: 400 },
        ),
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return attachCacheHeaders(
        NextResponse.json<EloHistoryResponse>({
          activated: false,
          profileId: "",
          samples: [],
          reason: "supabase_unavailable",
          windowStart,
          generatedAt: new Date().toISOString(),
        }, { status: 503 }),
      );
    }

    return buildResponse(supabase, forcedProfileIdNumber);
  }

  const session = await auth0.getSession();
  if (!session) {
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: false,
        profileId: "",
        samples: [],
        reason: "not_authenticated",
        windowStart,
        generatedAt: new Date().toISOString(),
      }, { status: 401 }),
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: false,
        profileId: "",
        samples: [],
        reason: "supabase_unavailable",
        windowStart,
        generatedAt: new Date().toISOString(),
      }, { status: 503 }),
    );
  }

  const auth0Sub = session.user.sub;
  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("primary_profile_id")
    .eq("auth0_sub", auth0Sub)
    .maybeSingle();

  if (appUserError) {
    console.error("[premium] elo-history failed to load app_user", appUserError);
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: false,
        profileId: "",
        samples: [],
        reason: "lookup_failed",
        windowStart,
        generatedAt: new Date().toISOString(),
      }, { status: 500 }),
    );
  }

  const primaryProfileId = appUser?.primary_profile_id
    ? Number.parseInt(String(appUser.primary_profile_id), 10)
    : null;

  if (!primaryProfileId) {
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: false,
        profileId: "",
        samples: [],
        reason: "profile_not_linked",
        windowStart,
        generatedAt: new Date().toISOString(),
      }, { status: 403 }),
    );
  }

  if (
    requestedProfileId &&
    Number.parseInt(requestedProfileId, 10) !== primaryProfileId
  ) {
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: false,
        profileId: String(primaryProfileId),
        samples: [],
        reason: "profile_mismatch",
        windowStart,
        generatedAt: new Date().toISOString(),
      }, { status: 403 }),
    );
  }

  const subscription = await fetchSubscriptionSnapshot(supabase, auth0Sub);
  if (!isStripeSubscriptionActive(subscription)) {
    return attachCacheHeaders(
      NextResponse.json<EloHistoryResponse>({
        activated: false,
        profileId: String(primaryProfileId),
        samples: [],
        reason: "not_subscribed",
        windowStart,
        generatedAt: new Date().toISOString(),
      }, { status: 403 }),
    );
  }

  return buildResponse(supabase, primaryProfileId);
}
