import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import {
  attachCacheHeaders,
  fetchSubscriptionSnapshot,
  getSupabaseAdmin,
  isStripeSubscriptionActive,
  resolveSinceDate,
} from "@/lib/premium/subscription-server";

interface MatchupRow {
  my_race_id: number | null;
  opponent_race_id: number | null;
  matches: number;
  wins: number;
  losses: number;
  winrate: string | number | null;
  last_played: string | null;
}

interface MatchupsResponse {
  activated: boolean;
  profileId: string;
  windowStart: string;
  generatedAt: string;
  matchTypeId?: number;
  rows: Array<{
    myRaceId: number | null;
    opponentRaceId: number | null;
    matches: number;
    wins: number;
    losses: number;
    winrate: number | null;
    lastPlayed: string | null;
  }>;
  reason?: string;
}

const coerceInt = (value: string | null, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return parsed;
};

const coerceOptionalInt = (value: string | null): number | undefined => {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const requestedProfileId =
    url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");

  const session = await auth0.getSession();
  if (!session) {
    return attachCacheHeaders(
      NextResponse.json<MatchupsResponse>({
        activated: false,
        profileId: "",
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "not_authenticated",
      }, { status: 401 })
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return attachCacheHeaders(
      NextResponse.json<MatchupsResponse>({
        activated: false,
        profileId: "",
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "supabase_unavailable",
      }, { status: 503 })
    );
  }

  const auth0Sub = session.user.sub;
  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select("primary_profile_id")
    .eq("auth0_sub", auth0Sub)
    .maybeSingle();

  if (appUserError) {
    console.error("[premium] matchups failed to load app_user", appUserError);
    return attachCacheHeaders(
      NextResponse.json<MatchupsResponse>({
        activated: false,
        profileId: "",
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "lookup_failed",
      }, { status: 500 })
    );
  }

  const primaryProfileId = appUser?.primary_profile_id
    ? Number.parseInt(String(appUser.primary_profile_id), 10)
    : null;

  if (!primaryProfileId) {
    return attachCacheHeaders(
      NextResponse.json<MatchupsResponse>({
        activated: false,
        profileId: "",
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "profile_not_linked",
      }, { status: 403 })
    );
  }

  if (
    requestedProfileId &&
    Number.parseInt(requestedProfileId, 10) !== primaryProfileId
  ) {
    return attachCacheHeaders(
      NextResponse.json<MatchupsResponse>({
        activated: false,
        profileId: String(primaryProfileId),
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "profile_mismatch",
      }, { status: 403 })
    );
  }

  const subscription = await fetchSubscriptionSnapshot(supabase, auth0Sub);
  if (!isStripeSubscriptionActive(subscription)) {
    return attachCacheHeaders(
      NextResponse.json<MatchupsResponse>({
        activated: false,
        profileId: String(primaryProfileId),
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "not_subscribed",
      }, { status: 403 })
    );
  }

  const profileId = String(primaryProfileId);

  const windowDays = coerceInt(url.searchParams.get("windowDays") ?? url.searchParams.get("window"), 90);
  const windowStart = resolveSinceDate(windowDays);
  const matchTypeParsed = coerceOptionalInt(url.searchParams.get("matchTypeId") ?? url.searchParams.get("match_type_id"));
  const matchTypeId = typeof matchTypeParsed === "number" && Number.isFinite(matchTypeParsed) ? matchTypeParsed : undefined;

  try {
    const { data, error } = await supabase.rpc("premium_get_matchup_stats", {
      p_profile_id: primaryProfileId,
      p_since: windowStart,
      p_match_type_id: typeof matchTypeId === "number" ? matchTypeId : null,
    });

    if (error) {
      console.error("[premium] matchup stats rpc failed", error);
      return attachCacheHeaders(
        NextResponse.json<MatchupsResponse>({
          activated: true,
          profileId,
          windowStart,
          matchTypeId,
          generatedAt: new Date().toISOString(),
          rows: [],
          reason: "rpc_failed",
        }, { status: 500 })
      );
    }

    const rows = ((data as MatchupRow[]) ?? []).map((row: MatchupRow) => ({
      myRaceId: row.my_race_id,
      opponentRaceId: row.opponent_race_id,
      matches: row.matches ?? 0,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      winrate: row.winrate === null || row.winrate === undefined ? null : Number(row.winrate),
      lastPlayed: row.last_played,
    }));

    return attachCacheHeaders(
      NextResponse.json<MatchupsResponse>({
        activated: true,
        profileId,
        windowStart,
        matchTypeId,
        generatedAt: new Date().toISOString(),
        rows,
      })
    );
  } catch (error) {
    console.error("[premium] matchup stats unexpected error", error);
    return attachCacheHeaders(
      NextResponse.json<MatchupsResponse>({
        activated: true,
        profileId,
        windowStart,
        matchTypeId,
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "unexpected_error",
      }, { status: 500 })
    );
  }
}
