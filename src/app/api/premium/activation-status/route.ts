import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import {
  attachCacheHeaders,
  fetchSubscriptionSnapshot,
  getSupabaseAdmin,
  isStripeSubscriptionActive,
} from "@/lib/premium/subscription-server";
import {
  getForcedAdvancedStatsProfileId,
  getForcedAdvancedStatsProfileIdNumber,
} from "@/lib/premium/force-advanced-stats";

type ActivationResponse = {
  activated: boolean;
  reason?: string;
  status?: string | null;
  cancelAtPeriodEnd?: boolean | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  profileId?: number | null;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const profileIdRaw =
    url.searchParams.get("profileId") ?? url.searchParams.get("profile_id");
  const profileIdParam = profileIdRaw?.trim() ?? null;

  const forcedProfileId = getForcedAdvancedStatsProfileId();
  const forcedProfileIdNumber = getForcedAdvancedStatsProfileIdNumber();
  const isForcedRequest =
    Boolean(
      forcedProfileId &&
      forcedProfileIdNumber !== null &&
      (!profileIdParam || profileIdParam === forcedProfileId),
    );

  if (isForcedRequest) {
    if (forcedProfileIdNumber === null) {
      return attachCacheHeaders(
        NextResponse.json<ActivationResponse>(
          { activated: false, reason: "invalid_forced_profile" },
          { status: 400 },
        ),
      );
    }

    return attachCacheHeaders(
      NextResponse.json<ActivationResponse>(
        {
          activated: true,
          status: "forced_preview",
          cancelAtPeriodEnd: false,
          currentPeriodStart: null,
          currentPeriodEnd: null,
          profileId: forcedProfileIdNumber,
        },
        { status: 200 },
      ),
    );
  }

  const session = await auth0.getSession();

  if (!session) {
    return attachCacheHeaders(
      NextResponse.json<ActivationResponse>(
        { activated: false, reason: "not_authenticated" },
        { status: 200 },
      ),
    );
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return attachCacheHeaders(
      NextResponse.json<ActivationResponse>(
        { activated: false, reason: "supabase_unavailable" },
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
    console.error("[premium] activation-status failed to load app_user", appUserError);
    return attachCacheHeaders(
      NextResponse.json<ActivationResponse>(
        { activated: false, reason: "lookup_failed" },
        { status: 500 },
      ),
    );
  }

  const primaryProfileId = appUser?.primary_profile_id
    ? Number.parseInt(String(appUser.primary_profile_id), 10)
    : null;

  if (!primaryProfileId) {
    return attachCacheHeaders(
      NextResponse.json<ActivationResponse>(
        { activated: false, reason: "profile_not_linked" },
        { status: 403 },
      ),
    );
  }

  if (profileIdParam && Number.parseInt(profileIdParam, 10) !== primaryProfileId) {
    return attachCacheHeaders(
      NextResponse.json<ActivationResponse>(
        { activated: false, reason: "profile_mismatch" },
        { status: 403 },
      ),
    );
  }

  const snapshot = await fetchSubscriptionSnapshot(supabase, auth0Sub);
  const active = isStripeSubscriptionActive(snapshot);

  if (!snapshot) {
    return attachCacheHeaders(
      NextResponse.json<ActivationResponse>(
        {
          activated: false,
          reason: "not_subscribed",
          profileId: primaryProfileId,
        },
        { status: 200 },
      ),
    );
  }

  return attachCacheHeaders(
    NextResponse.json<ActivationResponse>(
      {
        activated: active,
        reason: active ? undefined : "not_subscribed",
        status: snapshot.status,
        cancelAtPeriodEnd: snapshot.cancel_at_period_end ?? null,
        currentPeriodStart: snapshot.current_period_start ?? null,
        currentPeriodEnd: snapshot.current_period_end,
        profileId: primaryProfileId,
      },
      { status: 200 },
    ),
  );
}
