import { getSupabaseAdmin } from "@/lib/premium/subscription-server";

export type ProBadgeStatus = {
  isProMember: boolean;
  showBadge: boolean;
};

/**
 * Check if a profile should display the Pro badge
 * @param profileId - The profile ID to check
 * @returns Object with isProMember and showBadge flags
 */
export async function getProBadgeStatus(profileId: string | number): Promise<ProBadgeStatus> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return { isProMember: false, showBadge: false };
  }

  // Find app_user linked to this profile
  const { data: appUser } = await supabase
    .from("app_users")
    .select("stripe_subscription_status, premium_expires_at, show_pro_badge")
    .eq("primary_profile_id", profileId)
    .maybeSingle();

  if (!appUser) {
    return { isProMember: false, showBadge: false };
  }

  // Check if subscription is active
  const activeStatuses = ["active", "trialing", "past_due"];
  const isActive = activeStatuses.includes(appUser.stripe_subscription_status || "");

  // If subscription is active but no expiry date, treat as valid (likely recurring subscription)
  // If expiry date exists, check it's in the future
  const periodEnd = appUser.premium_expires_at;
  const isFuture = periodEnd
    ? Date.parse(periodEnd) > Date.now()
    : isActive; // If active with no expiry, consider it valid

  const isProMember = isActive && isFuture;
  const showBadge = isProMember && (appUser.show_pro_badge ?? true);

  return { isProMember, showBadge };
}

/**
 * Batch check Pro badge status for multiple profiles
 * More efficient than calling getProBadgeStatus multiple times
 */
export async function getBatchProBadgeStatus(
  profileIds: (string | number)[]
): Promise<Map<string, ProBadgeStatus>> {
  const supabase = getSupabaseAdmin();
  const resultMap = new Map<string, ProBadgeStatus>();

  // Normalize all profile IDs to strings for consistent Map keys
  const normalizedIds = profileIds.map(id => String(id));

  if (!supabase || normalizedIds.length === 0) {
    normalizedIds.forEach(id => {
      resultMap.set(id, { isProMember: false, showBadge: false });
    });
    return resultMap;
  }

  // Get all app_users linked to these profiles
  const { data: appUsers } = await supabase
    .from("app_users")
    .select("primary_profile_id, stripe_subscription_status, premium_expires_at, show_pro_badge")
    .in("primary_profile_id", profileIds);

  if (!appUsers || appUsers.length === 0) {
    normalizedIds.forEach(id => {
      resultMap.set(id, { isProMember: false, showBadge: false });
    });
    return resultMap;
  }

  // Build result map
  const activeStatuses = ["active", "trialing", "past_due"];
  const now = Date.now();

  appUsers.forEach(appUser => {
    const profileId = appUser.primary_profile_id;
    if (!profileId) return;

    const isActive = activeStatuses.includes(appUser.stripe_subscription_status || "");
    // If subscription is active but no expiry date, treat as valid (likely recurring subscription)
    // If expiry date exists, check it's in the future
    const isFuture = appUser.premium_expires_at
      ? Date.parse(appUser.premium_expires_at) > now
      : isActive; // If active with no expiry, consider it valid

    const isProMember = isActive && isFuture;
    const showBadge = isProMember && (appUser.show_pro_badge ?? true);

    // Normalize profileId to string for consistent Map keys
    resultMap.set(String(profileId), { isProMember, showBadge });
  });

  // Fill in missing profiles
  normalizedIds.forEach(id => {
    if (!resultMap.has(id)) {
      resultMap.set(id, { isProMember: false, showBadge: false });
    }
  });

  return resultMap;
}
