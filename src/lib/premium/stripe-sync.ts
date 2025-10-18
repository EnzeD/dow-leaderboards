"use server";

import Stripe from "stripe";
import { getSupabaseAdmin } from "@/lib/premium/activation-server";
import { getStripe } from "@/lib/stripe";

const parseProfileId = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.floor(value) : null;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
};

type SyncStripeSubscriptionOptions = {
  auth0Sub: string;
  checkoutSessionId?: string | null;
  existingCustomerId?: string | null;
};

export type SyncStripeSubscriptionResult = {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeSubscriptionStatus: string | null;
  stripeSubscriptionCancelAtPeriodEnd: boolean;
  premiumExpiresAt: string | null;
  primaryProfileId: number | null;
  premiumActivationExpiresAt: string | null;
  premiumActivationExists: boolean;
};

const extractSubscriptionFromSession = async (
  stripe: Stripe,
  checkoutSessionId: string,
) => {
  const session = await stripe.checkout.sessions.retrieve(checkoutSessionId, {
    expand: ["subscription"],
  });

  let subscription: Stripe.Subscription | null = null;

  if (session.subscription) {
    if (typeof session.subscription === "string") {
      subscription = await stripe.subscriptions.retrieve(session.subscription);
    } else {
      subscription = session.subscription as Stripe.Subscription;
    }
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const profileIdFromMetadata =
    parseProfileId(session.metadata?.profile_id) ??
    parseProfileId(session.metadata?.profileId) ??
    parseProfileId(session.metadata?.profileID) ??
    null;

  return { subscription, customerId, profileIdFromMetadata };
};

const extractProfileIdFromSubscription = (
  subscription: Stripe.Subscription | null,
): number | null => {
  if (!subscription) return null;
  return (
    parseProfileId(subscription.metadata?.profile_id) ??
    parseProfileId(subscription.metadata?.profileId) ??
    parseProfileId(subscription.metadata?.profileID) ??
    null
  );
};

export async function syncStripeSubscription({
  auth0Sub,
  checkoutSessionId,
  existingCustomerId,
}: SyncStripeSubscriptionOptions): Promise<SyncStripeSubscriptionResult | null> {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    console.error("[premium] stripe sync skipped; Supabase admin client unavailable");
    return null;
  }

  let stripe: Stripe;
  try {
    stripe = await getStripe();
  } catch (error) {
    console.error("[premium] stripe sync skipped; Stripe client unavailable", error);
    return null;
  }

  const { data: appUser, error: appUserError } = await supabase
    .from("app_users")
    .select(
      "primary_profile_id, stripe_customer_id, stripe_subscription_id, stripe_subscription_status, stripe_subscription_cancel_at_period_end, premium_expires_at",
    )
    .eq("auth0_sub", auth0Sub)
    .maybeSingle();

  if (appUserError) {
    console.error("[premium] stripe sync failed to load app_user", appUserError);
    return null;
  }

  let primaryProfileId = appUser?.primary_profile_id
    ? Number.parseInt(String(appUser.primary_profile_id), 10)
    : null;
  let stripeCustomerId = existingCustomerId ?? appUser?.stripe_customer_id ?? null;

  let resolvedSubscription: Stripe.Subscription | null = null;
  let profileIdFromMetadata: number | null = null;

  if (checkoutSessionId) {
    try {
      const sessionExtraction = await extractSubscriptionFromSession(
        stripe,
        checkoutSessionId,
      );
      resolvedSubscription = sessionExtraction.subscription;
      profileIdFromMetadata = sessionExtraction.profileIdFromMetadata;
      if (sessionExtraction.customerId) {
        stripeCustomerId = sessionExtraction.customerId;
      }
    } catch (error) {
      console.error("[premium] stripe sync failed to retrieve checkout session", {
        checkoutSessionId,
        error,
      });
    }
  }

  if (!resolvedSubscription && stripeCustomerId) {
    try {
      const subscriptionList = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "all",
        limit: 1,
      });
      resolvedSubscription = subscriptionList.data[0] ?? null;
    } catch (error) {
      console.error("[premium] stripe sync failed to list subscriptions", {
        stripeCustomerId,
        error,
      });
    }
  }

  if (!primaryProfileId) {
    primaryProfileId =
      profileIdFromMetadata ??
      extractProfileIdFromSubscription(resolvedSubscription) ??
      null;
  }

  const subscriptionStatus = resolvedSubscription?.status ?? null;
  const subscriptionId = resolvedSubscription?.id ?? null;
  const subscriptionCancelsAtPeriodEnd = Boolean(
    resolvedSubscription?.cancel_at_period_end,
  );
  const subscriptionWithPeriods = resolvedSubscription as Stripe.Subscription & {
    current_period_end?: number | null;
    current_period_start?: number | null;
  } | null;

  const currentPeriodEnd = subscriptionWithPeriods?.current_period_end
    ? new Date(subscriptionWithPeriods.current_period_end * 1000).toISOString()
    : null;
  const currentPeriodStart = subscriptionWithPeriods?.current_period_start
    ? new Date(subscriptionWithPeriods.current_period_start * 1000).toISOString()
    : new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: subscriptionId,
    stripe_subscription_status: subscriptionStatus,
    stripe_subscription_cancel_at_period_end: subscriptionCancelsAtPeriodEnd,
    premium_expires_at: currentPeriodEnd,
  };

  if (primaryProfileId) {
    updatePayload.primary_profile_id = primaryProfileId;
  }

  const { error: updateError } = await supabase
    .from("app_users")
    .update(updatePayload)
    .eq("auth0_sub", auth0Sub);

  if (updateError) {
    console.error("[premium] stripe sync failed to update app_user", updateError);
  }

  let activationExists = false;
  let activationExpiresAt: string | null = null;

  if (primaryProfileId) {
    if (resolvedSubscription) {
      const { error: activationUpsertError } = await supabase
        .from("premium_feature_activations")
        .upsert(
          {
            profile_id: primaryProfileId,
            activated_at: currentPeriodStart,
            expires_at: currentPeriodEnd,
            notes: "stripe_sync",
          },
          { onConflict: "profile_id" },
        );

      if (activationUpsertError) {
        console.error(
          "[premium] stripe sync failed to upsert premium activation",
          activationUpsertError,
        );
      } else {
        activationExists = true;
        activationExpiresAt = currentPeriodEnd;
      }
    } else {
      const { error: activationDeleteError } = await supabase
        .from("premium_feature_activations")
        .delete()
        .eq("profile_id", primaryProfileId);

      if (activationDeleteError) {
        console.error(
          "[premium] stripe sync failed to delete premium activation",
          activationDeleteError,
        );
      }
    }
  }

  return {
    stripeCustomerId,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: subscriptionStatus,
    stripeSubscriptionCancelAtPeriodEnd: subscriptionCancelsAtPeriodEnd,
    premiumExpiresAt: currentPeriodEnd,
    primaryProfileId,
    premiumActivationExpiresAt: activationExpiresAt,
    premiumActivationExists: activationExists,
  };
}
