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

interface OpponentRow {
  opponent_profile_id: string | number | null;
  opponent_alias: string | null;
  opponent_country?: string | null;
  opponent_main_race_id?: number | null;
  matches: number;
  wins: number;
  losses: number;
  winrate: string | number | null;
  last_played: string | null;
}

interface OpponentsResponse {
  activated: boolean;
  profileId: string;
  windowStart: string;
  generatedAt: string;
  matchTypeId?: number;
  matchScope?: "all" | "automatch" | "custom";
  rows: Array<{
    opponentProfileId: string | null;
    opponentAlias: string;
    opponentCountry: string | null;
    opponentMainRaceId: number | null;
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

const normalizeOpponentAlias = (
  alias: string | null,
  profileId: string | number | null,
): string => {
  if (alias && alias.trim().length > 0) {
    return alias.trim();
  }
  if (typeof profileId === "number") {
    return profileId.toString();
  }
  if (typeof profileId === "string" && profileId.trim().length > 0) {
    return profileId.trim();
  }
  return "Unknown";
};

const normalizeProfileId = (value: string | number | null): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toString();
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const requestedProfileIdRaw =
    url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const requestedProfileId = requestedProfileIdRaw?.trim() ?? null;

  const windowDays = coerceInt(
    url.searchParams.get("windowDays") ?? url.searchParams.get("window"),
    90,
  );
  const windowStart = resolveSinceDate(windowDays);
  const matchTypeParsed = coerceOptionalInt(
    url.searchParams.get("matchTypeId") ?? url.searchParams.get("match_type_id"),
  );
  const matchTypeId =
    typeof matchTypeParsed === "number" && Number.isFinite(matchTypeParsed)
      ? matchTypeParsed
      : undefined;
  const matchScopeRaw =
    url.searchParams.get("matchScope") ??
    url.searchParams.get("match_scope") ??
    url.searchParams.get("matchTypeScope") ??
    url.searchParams.get("match_type_scope") ??
    "";
  const matchScope = ((): "all" | "automatch" | "custom" => {
    const normalized = matchScopeRaw.toLowerCase();
    if (normalized === "automatch" || normalized === "custom") return normalized;
    return "all";
  })();
  const limit = coerceInt(url.searchParams.get("limit"), 10);
  const rpcMatchTypeId = ((): number | null => {
    if (typeof matchTypeId === "number") return matchTypeId;
    if (matchScope === "automatch") return -1;
    if (matchScope === "custom") return -2;
    return null;
  })();

  const buildResponse = async (
    supabaseClient: SupabaseClient,
    profileNumeric: number,
  ) => {
    const profileId = String(profileNumeric);

    try {
      const { data, error } = await supabaseClient.rpc("premium_get_opponent_stats", {
        p_profile_id: profileNumeric,
        p_since: windowStart,
        p_match_type_id: rpcMatchTypeId,
        p_limit: limit,
      });

      if (error) {
        console.error("[premium] opponent stats rpc failed", error);
        return attachCacheHeaders(
          NextResponse.json<OpponentsResponse>(
            {
              activated: true,
              profileId,
              windowStart,
              matchTypeId,
              matchScope,
              generatedAt: new Date().toISOString(),
              rows: [],
              reason: "rpc_failed",
            },
            { status: 500 },
          ),
        );
      }

      const rows = ((data as OpponentRow[]) ?? []).map((row: OpponentRow) => {
        const opponentProfile = normalizeProfileId(row.opponent_profile_id ?? null);
        const opponentCountry =
          typeof (row as any)?.opponent_country === "string"
            ? ((row as any).opponent_country as string)
            : null;
        const opponentMainRaceId =
          typeof (row as any)?.opponent_main_race_id === "number"
            ? ((row as any).opponent_main_race_id as number)
            : null;

        return {
          opponentProfileId: opponentProfile,
          opponentAlias: normalizeOpponentAlias(row.opponent_alias, opponentProfile),
          opponentCountry,
          opponentMainRaceId,
          matches: row.matches ?? 0,
          wins: row.wins ?? 0,
          losses: row.losses ?? 0,
          winrate:
            row.winrate === null || row.winrate === undefined
              ? null
              : Number(row.winrate),
          lastPlayed: row.last_played,
        };
      });

      return attachCacheHeaders(
        NextResponse.json<OpponentsResponse>({
          activated: true,
          profileId,
          windowStart,
          matchTypeId,
          matchScope,
          generatedAt: new Date().toISOString(),
          rows,
        }),
      );
    } catch (error) {
      console.error("[premium] opponent stats unexpected error", error);
      return attachCacheHeaders(
        NextResponse.json<OpponentsResponse>(
          {
            activated: true,
            profileId,
            windowStart,
            matchTypeId,
            matchScope,
            generatedAt: new Date().toISOString(),
            rows: [],
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
        NextResponse.json<OpponentsResponse>(
          {
            activated: false,
            profileId: "",
            windowStart,
            generatedAt: new Date().toISOString(),
            rows: [],
            reason: "invalid_forced_profile",
          },
          { status: 400 },
        ),
      );
    }

    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return attachCacheHeaders(
        NextResponse.json<OpponentsResponse>(
          {
            activated: false,
            profileId: "",
            windowStart,
            generatedAt: new Date().toISOString(),
            rows: [],
            reason: "supabase_unavailable",
          },
          { status: 503 },
        ),
      );
    }

    return buildResponse(supabase, forcedProfileIdNumber);
  }

  const session = await auth0.getSession();
  if (!session) {
    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>(
        {
          activated: false,
          profileId: "",
          windowStart,
          generatedAt: new Date().toISOString(),
          rows: [],
          reason: "not_authenticated",
        },
        { status: 401 },
      ),
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>(
        {
          activated: false,
          profileId: "",
          windowStart,
          generatedAt: new Date().toISOString(),
          rows: [],
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
    console.error("[premium] opponents failed to load app_user", appUserError);
    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>(
        {
          activated: false,
          profileId: "",
          windowStart,
          generatedAt: new Date().toISOString(),
          rows: [],
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
      NextResponse.json<OpponentsResponse>(
        {
          activated: false,
          profileId: "",
          windowStart,
          generatedAt: new Date().toISOString(),
          rows: [],
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
      NextResponse.json<OpponentsResponse>(
        {
          activated: false,
          profileId: String(primaryProfileId),
          windowStart,
          generatedAt: new Date().toISOString(),
          rows: [],
          reason: "profile_mismatch",
        },
        { status: 403 },
      ),
    );
  }

  const subscription = await fetchSubscriptionSnapshot(supabase, auth0Sub);
  if (!isStripeSubscriptionActive(subscription)) {
    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>(
        {
          activated: false,
          profileId: String(primaryProfileId),
          windowStart,
          generatedAt: new Date().toISOString(),
          rows: [],
          reason: "not_subscribed",
        },
        { status: 403 },
      ),
    );
  }

  return buildResponse(supabase, primaryProfileId);
}
