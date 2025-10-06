import { NextRequest, NextResponse } from "next/server";
import {
  attachCacheHeaders,
  getSupabaseAdmin,
  resolveActivationStatus,
  resolveSinceDate,
} from "@/lib/premium/activation-server";

interface MapRow {
  map_identifier: string | null;
  map_name: string | null;
  match_type_id: number | null;
  matches: number;
  wins: number;
  losses: number;
  winrate: string | number | null;
  last_played: string | null;
}

interface MapsResponse {
  activated: boolean;
  profileId: string;
  windowStart: string;
  generatedAt: string;
  matchTypeId?: number;
  rows: Array<{
    mapIdentifier: string;
    mapName: string;
    matchTypeId: number | null;
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

const normalizeMapIdentifier = (identifier: string | null): string => {
  if (!identifier) return "unknown";
  const trimmed = identifier.trim();
  if (!trimmed) return "unknown";
  return trimmed;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const profileIdRaw = url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const profileId = profileIdRaw?.trim();

  if (!profileId) {
    return attachCacheHeaders(
      NextResponse.json<MapsResponse>({
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
      NextResponse.json<MapsResponse>({
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
      NextResponse.json<MapsResponse>({
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
  const limit = coerceInt(url.searchParams.get("limit"), 50);

  try {
    const { data, error } = await supabase.rpc("premium_get_map_stats", {
      p_profile_id: profileId,
      p_since: windowStart,
      p_match_type_id: typeof matchTypeId === "number" ? matchTypeId : null,
      p_limit: limit,
    });

    if (error) {
      console.error("[premium] map stats rpc failed", error);
      return attachCacheHeaders(
        NextResponse.json<MapsResponse>({
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

    const rows = ((data as MapRow[]) ?? []).map((row: MapRow) => ({
      mapIdentifier: normalizeMapIdentifier(row.map_identifier),
      mapName: row.map_name ?? "Unknown Map",
      matchTypeId: row.match_type_id,
      matches: row.matches ?? 0,
      wins: row.wins ?? 0,
      losses: row.losses ?? 0,
      winrate: row.winrate === null || row.winrate === undefined ? null : Number(row.winrate),
      lastPlayed: row.last_played,
    }));

    return attachCacheHeaders(
      NextResponse.json<MapsResponse>({
        activated: true,
        profileId,
        windowStart,
        matchTypeId,
        generatedAt: new Date().toISOString(),
        rows,
      })
    );
  } catch (error) {
    console.error("[premium] map stats unexpected error", error);
    return attachCacheHeaders(
      NextResponse.json<MapsResponse>({
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

