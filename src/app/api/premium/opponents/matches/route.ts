import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import {
  attachCacheHeaders,
  fetchSubscriptionSnapshot,
  getSupabaseAdmin,
  isStripeSubscriptionActive,
  resolveSinceDate,
} from "@/lib/premium/subscription-server";

type OpponentMatchPlayer = {
  profileId: string | null;
  alias: string | null;
  teamId: number | null;
  raceId: number | null;
  oldRating: number | null;
  newRating: number | null;
};

type OpponentMatchRow = {
  matchId: number;
  mapName: string | null;
  matchTypeId: number | null;
  startedAt: string | null;
  completedAt: string | null;
  durationSeconds: number | null;
  outcome: "win" | "loss" | "unknown";
  oldRating: number | null;
  newRating: number | null;
  ratingDelta: number | null;
  teamId: number | null;
  raceId: number | null;
  players: OpponentMatchPlayer[];
};

type OpponentMatchHistoryResponse = {
  activated: boolean;
  profileId: string;
  opponentProfileId: string;
  windowStart: string;
  generatedAt: string;
  matchTypeId?: number;
  matchScope?: "all" | "automatch" | "custom";
  rows: OpponentMatchRow[];
  reason?: string;
};

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

const normalizeProfileId = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
};

const normalizeAlias = (value: unknown, fallback: string | null): string | null => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
};

const normalizeOutcome = (value: unknown): "win" | "loss" | "unknown" => {
  if (typeof value !== "string") return "unknown";
  const lower = value.toLowerCase();
  if (lower === "win" || lower === "loss") return lower;
  return "unknown";
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const requestedProfileId =
    url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");

  const opponentParam =
    url.searchParams.get("opponentProfileId") ?? url.searchParams.get("opponent_profile_id");

  const session = await auth0.getSession();
  if (!session) {
    return attachCacheHeaders(
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: false,
        profileId: "",
        opponentProfileId: "",
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
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: false,
        profileId: "",
        opponentProfileId: "",
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
    console.error("[premium] opponent history failed to load app_user", appUserError);
    return attachCacheHeaders(
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: false,
        profileId: "",
        opponentProfileId: "",
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
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: false,
        profileId: "",
        opponentProfileId: "",
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
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: false,
        profileId: String(primaryProfileId),
        opponentProfileId: "",
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
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: false,
        profileId: String(primaryProfileId),
        opponentProfileId: "",
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "not_subscribed",
      }, { status: 403 })
    );
  }

  const opponentProfileId = opponentParam ? Number.parseInt(opponentParam, 10) : NaN;
  if (!Number.isFinite(opponentProfileId)) {
    return attachCacheHeaders(
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: true,
        profileId: String(primaryProfileId),
        opponentProfileId: "",
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "opponent_profile_required",
      }, { status: 400 })
    );
  }

  const profileId = String(primaryProfileId);
  const opponentProfileIdStr = String(opponentProfileId);

  const windowDays = coerceInt(url.searchParams.get("windowDays") ?? url.searchParams.get("window"), 90);
  const windowStart = resolveSinceDate(windowDays);
  const matchTypeParsed = coerceOptionalInt(url.searchParams.get("matchTypeId") ?? url.searchParams.get("match_type_id"));
  const matchTypeId = typeof matchTypeParsed === "number" && Number.isFinite(matchTypeParsed) ? matchTypeParsed : undefined;
  const matchScopeRaw =
    url.searchParams.get("matchScope")
    ?? url.searchParams.get("match_scope")
    ?? url.searchParams.get("matchTypeScope")
    ?? url.searchParams.get("match_type_scope")
    ?? "";
  const matchScope = ((): "all" | "automatch" | "custom" => {
    const normalized = matchScopeRaw.toLowerCase();
    if (normalized === "automatch" || normalized === "custom") return normalized;
    return "all";
  })();
  const limit = coerceInt(url.searchParams.get("limit"), 20);
  const rpcMatchTypeId = ((): number | null => {
    if (typeof matchTypeId === "number") return matchTypeId;
    if (matchScope === "automatch") return -1;
    if (matchScope === "custom") return -2;
    return null;
  })();

  try {
    const { data, error } = await supabase.rpc("premium_get_opponent_match_history", {
      p_profile_id: primaryProfileId,
      p_opponent_profile_id: opponentProfileId,
      p_since: windowStart,
      p_match_type_id: rpcMatchTypeId,
      p_limit: limit,
    });

    if (error) {
      console.error("[premium] opponent match history rpc failed", error);
      return attachCacheHeaders(
        NextResponse.json<OpponentMatchHistoryResponse>({
          activated: true,
          profileId,
          opponentProfileId: opponentProfileIdStr,
          windowStart,
          matchTypeId,
          matchScope,
          generatedAt: new Date().toISOString(),
          rows: [],
          reason: "rpc_failed",
        }, { status: 500 })
      );
    }

    const rows = Array.isArray(data) ? data : [];
    const normalizedRows: OpponentMatchRow[] = rows.map((row: any) => {
      const playersArray: OpponentMatchPlayer[] = Array.isArray(row?.players)
        ? row.players.map((player: any) => ({
          profileId: normalizeProfileId(player?.profileId),
          alias: normalizeAlias(player?.alias, normalizeProfileId(player?.profileId)),
          teamId: typeof player?.teamId === "number" ? player.teamId : null,
          raceId: typeof player?.raceId === "number" ? player.raceId : null,
          oldRating: typeof player?.oldRating === "number" ? player.oldRating : null,
          newRating: typeof player?.newRating === "number" ? player.newRating : null,
        })) : [];

      return {
        matchId: typeof row?.match_id === "number" ? row.match_id : Number.parseInt(String(row?.match_id ?? 0), 10) || 0,
        mapName: typeof row?.map_name === "string" ? row.map_name : null,
        matchTypeId: typeof row?.match_type_id === "number" ? row.match_type_id : null,
        startedAt: typeof row?.started_at === "string" ? row.started_at : (row?.started_at instanceof Date ? row.started_at.toISOString() : null),
        completedAt: typeof row?.completed_at === "string" ? row.completed_at : (row?.completed_at instanceof Date ? row.completed_at.toISOString() : null),
        durationSeconds: typeof row?.duration_seconds === "number" ? row.duration_seconds : null,
        outcome: normalizeOutcome(row?.outcome),
        oldRating: typeof row?.old_rating === "number" ? row.old_rating : null,
        newRating: typeof row?.new_rating === "number" ? row.new_rating : null,
        ratingDelta: typeof row?.rating_delta === "number" ? row.rating_delta : null,
        teamId: typeof row?.team_id === "number" ? row.team_id : null,
        raceId: typeof row?.race_id === "number" ? row.race_id : null,
        players: playersArray,
      };
    });

    return attachCacheHeaders(
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: true,
        profileId,
        opponentProfileId: opponentProfileIdStr,
        windowStart,
        matchTypeId,
        matchScope,
        generatedAt: new Date().toISOString(),
        rows: normalizedRows,
      })
    );
  } catch (error) {
    console.error("[premium] opponent match history unexpected error", error);
    return attachCacheHeaders(
      NextResponse.json<OpponentMatchHistoryResponse>({
        activated: true,
        profileId,
        opponentProfileId: opponentProfileIdStr,
        windowStart,
        matchTypeId,
        matchScope,
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "unexpected_error",
      }, { status: 500 })
    );
  }
}
