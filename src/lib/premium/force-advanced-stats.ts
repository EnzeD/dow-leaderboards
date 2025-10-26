const parseBoolean = (value?: string | null): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
};

const getRawForcedProfileId = (): string | null => {
  if (!parseBoolean(process.env.NEXT_PUBLIC_FORCE_ADVANCED_STATS)) {
    return null;
  }
  const raw = process.env.NEXT_PUBLIC_FORCE_ADVANCED_STATS_PROFILE;
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getForcedAdvancedStatsProfileId = (): string | null => getRawForcedProfileId();

export const getForcedAdvancedStatsProfileIdNumber = (): number | null => {
  const forced = getRawForcedProfileId();
  if (!forced) return null;
  const parsed = Number.parseInt(forced, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

export const matchesForcedAdvancedStatsProfile = (
  profileId?: string | number | null,
): boolean => {
  const forced = getRawForcedProfileId();
  if (!forced) return false;
  if (profileId === undefined || profileId === null) return false;
  const candidate = typeof profileId === "number" ? String(profileId) : profileId.trim();
  if (!candidate) return false;
  return candidate === forced;
};
