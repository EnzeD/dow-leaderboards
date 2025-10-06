import { NextRequest, NextResponse } from "next/server";
import {
  attachCacheHeaders,
  getSupabaseAdmin,
  resolveActivationStatus,
  resolveSinceDate,
} from "@/lib/premium/activation-server";

interface OpponentRow {
  opponent_profile_id: string | number | null;
  opponent_alias: string | null;
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
  rows: Array<{
    opponentProfileId: string | null;
    opponentAlias: string;
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

const normalizeOpponentAlias = (alias: string | null, profileId: string | number | null): string => {
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
  const profileIdRaw = url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const profileId = profileIdRaw?.trim();

  if (!profileId) {
    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>({
        activated: false,
        profileId: "",
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "missing_profile",
      }, { status: 400 })
    );
  }

  const activation = await resolveActivationStatus(profileId);
  if (!activation.activated) {
    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>({
        activated: false,
        profileId,
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: activation.reason,
      }, { status: 403 })
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>({
        activated: false,
        profileId,
        windowStart: resolveSinceDate(),
        generatedAt: new Date().toISOString(),
        rows: [],
        reason: "supabase_not_configured",
      }, { status: 503 })
    );
  }

  const windowDays = coerceInt(url.searchParams.get("windowDays") ?? url.searchParams.get("window"), 90);
  const windowStart = resolveSinceDate(windowDays);
  const matchTypeParsed = coerceOptionalInt(url.searchParams.get("matchTypeId") ?? url.searchParams.get("match_type_id"));
  const matchTypeId = typeof matchTypeParsed === "number" && Number.isFinite(matchTypeParsed) ? matchTypeParsed : undefined;
  const limit = coerceInt(url.searchParams.get("limit"), 10);

  try {
    const { data, error } = await supabase.rpc("premium_get_opponent_stats", {
      p_profile_id: profileId,
      p_since: windowStart,
      p_match_type_id: typeof matchTypeId === "number" ? matchTypeId : null,
      p_limit: limit,
    });

    if (error) {
      console.error("[premium] opponent stats rpc failed", error);
      return attachCacheHeaders(
        NextResponse.json<OpponentsResponse>({
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

    const rows = ((data as OpponentRow[]) ?? []).map((row: OpponentRow) => {
      const opponentProfile = normalizeProfileId(row.opponent_profile_id ?? null);
      return {
        opponentProfileId: opponentProfile,
        opponentAlias: normalizeOpponentAlias(row.opponent_alias, opponentProfile),
        matches: row.matches ?? 0,
        wins: row.wins ?? 0,
        losses: row.losses ?? 0,
        winrate: row.winrate === null || row.winrate === undefined ? null : Number(row.winrate),
        lastPlayed: row.last_played,
      };
    });

    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>({
        activated: true,
        profileId,
        windowStart,
        matchTypeId,
        generatedAt: new Date().toISOString(),
        rows,
      })
    );
  } catch (error) {
    console.error("[premium] opponent stats unexpected error", error);
    return attachCacheHeaders(
      NextResponse.json<OpponentsResponse>({
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

