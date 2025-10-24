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
    .select("auth0_sub, show_pro_badge")
    .eq("primary_profile_id", profileId)
    .maybeSingle();

  if (!appUser) {
    return { isProMember: false, showBadge: false };
  }

  // Check subscription status
  const { data: subscription } = await supabase
    .from("premium_subscriptions")
    .select("status, current_period_end")
    .eq("auth0_sub", appUser.auth0_sub)
    .maybeSingle();

  if (!subscription) {
    return { isProMember: false, showBadge: false };
  }

  // Check if subscription is active
  const activeStatuses = ["active", "trialing", "past_due"];
  const isActive = activeStatuses.includes(subscription.status || "");

  const periodEnd = subscription.current_period_end;
  const isFuture = periodEnd ? Date.parse(periodEnd) > Date.now() : false;

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
): Promise<Map<string | number, ProBadgeStatus>> {
  const supabase = getSupabaseAdmin();
  const resultMap = new Map<string | number, ProBadgeStatus>();

  if (!supabase || profileIds.length === 0) {
    profileIds.forEach(id => {
      resultMap.set(id, { isProMember: false, showBadge: false });
    });
    return resultMap;
  }

  // Get all app_users linked to these profiles
  const { data: appUsers } = await supabase
    .from("app_users")
    .select("auth0_sub, primary_profile_id, show_pro_badge")
    .in("primary_profile_id", profileIds);

  if (!appUsers || appUsers.length === 0) {
    profileIds.forEach(id => {
      resultMap.set(id, { isProMember: false, showBadge: false });
    });
    return resultMap;
  }

  // Get all subscriptions for these users
  const auth0Subs = appUsers.map(u => u.auth0_sub);
  const { data: subscriptions } = await supabase
    .from("premium_subscriptions")
    .select("auth0_sub, status, current_period_end")
    .in("auth0_sub", auth0Subs);

  const subscriptionMap = new Map(
    subscriptions?.map(s => [s.auth0_sub, s]) || []
  );

  // Build result map
  const activeStatuses = ["active", "trialing", "past_due"];
  const now = Date.now();

  appUsers.forEach(appUser => {
    const profileId = appUser.primary_profile_id;
    if (!profileId) return;

    const subscription = subscriptionMap.get(appUser.auth0_sub);
    if (!subscription) {
      resultMap.set(profileId, { isProMember: false, showBadge: false });
      return;
    }

    const isActive = activeStatuses.includes(subscription.status || "");
    const isFuture = subscription.current_period_end
      ? Date.parse(subscription.current_period_end) > now
      : false;

    const isProMember = isActive && isFuture;
    const showBadge = isProMember && (appUser.show_pro_badge ?? true);

    resultMap.set(profileId, { isProMember, showBadge });
  });

  // Fill in missing profiles
  profileIds.forEach(id => {
    if (!resultMap.has(id)) {
      resultMap.set(id, { isProMember: false, showBadge: false });
    }
  });

  return resultMap;
}
