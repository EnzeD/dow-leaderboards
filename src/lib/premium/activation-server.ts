import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type ActivationStatus = {
  activated: boolean;
  forced: boolean;
  reason?: string;
  activatedAt?: string;
  expiresAt?: string | null;
};

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin: SupabaseClient | null = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

type ActivationRecord = {
  profile_id: string;
  activated_at: string;
  expires_at: string | null;
};

const coerceBoolean = (value: string | undefined | null): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const parseForcedProfiles = (value: string | undefined | null): Set<string> => {
  if (!value) return new Set();
  return new Set(
    value
      .split(",")
      .map((token) => token.trim())
      .filter((token) => token.length > 0)
  );
};

const forceAll = coerceBoolean(process.env.NEXT_PUBLIC_FORCE_ADVANCED_STATS);
const forcedProfiles = parseForcedProfiles(process.env.NEXT_PUBLIC_FORCE_ADVANCED_STATS_PROFILE);

export const getSupabaseAdmin = () => supabaseAdmin;

export const isEnvForcedProfile = (profileId: string | null | undefined): boolean => {
  if (!profileId) return false;
  if (forceAll) return true;
  return forcedProfiles.has(profileId);
};

export const resolveActivationStatus = async (profileId: string): Promise<ActivationStatus> => {
  if (isEnvForcedProfile(profileId)) {
    return {
      activated: true,
      forced: true,
      reason: "env_override",
    };
  }

  if (!supabaseAdmin) {
    return {
      activated: false,
      forced: false,
      reason: "supabase_not_configured",
    };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from<ActivationRecord>("premium_feature_activations")
      .select("profile_id, activated_at, expires_at")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (error) {
      console.error("[premium] activation lookup failed", error);
      return {
        activated: false,
        forced: false,
        reason: "lookup_failed",
      };
    }

    if (!data) {
      return {
        activated: false,
        forced: false,
        reason: "not_found",
      };
    }

    if (data.expires_at) {
      const expiresAtDate = new Date(data.expires_at);
      if (!Number.isNaN(expiresAtDate.getTime()) && expiresAtDate.getTime() < Date.now()) {
        return {
          activated: false,
          forced: false,
          reason: "expired",
          expiresAt: data.expires_at,
        };
      }
    }

    return {
      activated: true,
      forced: false,
      reason: "database",
      activatedAt: data.activated_at,
      expiresAt: data.expires_at,
    };
  } catch (error) {
    console.error("[premium] activation status unexpected error", error);
    return {
      activated: false,
      forced: false,
      reason: "unexpected_error",
    };
  }
};

export const attachCacheHeaders = (response: Response) => {
  response.headers.set("Cache-Control", "private, max-age=0, s-maxage=30");
  response.headers.set("Content-Type", "application/json");
  return response;
};

export const resolveSinceDate = (windowDays?: number | null): string => {
  const days = windowDays && Number.isFinite(windowDays) && windowDays > 0
    ? Math.min(windowDays, 365)
    : 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return since.toISOString();
};

