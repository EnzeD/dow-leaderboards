import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/premium/subscription-server";

export const PUBLIC_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=1800";

export const getSupabase = (): SupabaseClient | null => {
  return getSupabaseAdmin();
};

export const clampNumber = (
  value: number | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const parseIntegerParam = (
  params: URLSearchParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number => {
  const raw = params.get(key);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return clampNumber(parsed, fallback, min, max);
};

export const resolveWindowDays = (
  params: URLSearchParams,
  key: string = "windowDays",
  fallback: number = 90,
  min: number = 30,
  max: number = 365,
): number => {
  return parseIntegerParam(params, key, fallback, min, max);
};

export const pickAllowedNumber = (
  value: number,
  allowed: readonly number[],
  fallback: number,
): number => {
  return allowed.includes(value) ? value : fallback;
};

export const ALLOWED_RATING_FLOORS = [0, 1200, 1400] as const;

export const resolveRatingFloor = (
  params: URLSearchParams,
  key: string = "minRating",
  fallback: number = 0,
): number => {
  const requested = parseIntegerParam(params, key, fallback, 0, 10000);
  return pickAllowedNumber(requested, ALLOWED_RATING_FLOORS, fallback);
};
