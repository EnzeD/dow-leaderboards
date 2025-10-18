"use server";

import Stripe from "stripe";
import {
  getSupabaseAdmin,
  upsertSubscriptionSnapshot,
} from "@/lib/premium/subscription-server";
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
  currentPeriodEnd: string | null;
  currentPeriodStart: string | null;
  primaryProfileId: number | null;
  priceId: string | null;
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

const derivePriceId = (subscription: Stripe.Subscription | null): string | null => {
  if (!subscription) return null;
  const firstItem = subscription.items?.data?.[0];
  if (!firstItem) return null;
  if (typeof firstItem.price?.id === "string") {
    return firstItem.price.id;
  }
  return null;
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
    .select("primary_profile_id, stripe_customer_id, stripe_subscription_id")
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
  const storedSubscriptionId = appUser?.stripe_subscription_id ?? null;

  let resolvedSubscription: Stripe.Subscription | null = null;
  let profileIdFromMetadata: number | null = null;

  const isValidCheckoutSessionId = (value: string | null | undefined) =>
    typeof value === "string" && /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(value);

  const resolvedCheckoutSessionId = isValidCheckoutSessionId(checkoutSessionId)
    ? checkoutSessionId!
    : null;

  if (resolvedCheckoutSessionId) {
    try {
      const sessionExtraction = await extractSubscriptionFromSession(
        stripe,
        resolvedCheckoutSessionId,
      );
      resolvedSubscription = sessionExtraction.subscription;
      profileIdFromMetadata = sessionExtraction.profileIdFromMetadata;
      if (sessionExtraction.customerId) {
        stripeCustomerId = sessionExtraction.customerId;
      }
    } catch (error) {
      console.error("[premium] stripe sync failed to retrieve checkout session", {
        checkoutSessionId: resolvedCheckoutSessionId,
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

  if (!resolvedSubscription && storedSubscriptionId) {
    try {
      resolvedSubscription = await stripe.subscriptions.retrieve(storedSubscriptionId);
    } catch (error) {
      console.error("[premium] stripe sync failed to retrieve stored subscription", {
        storedSubscriptionId,
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
    resolvedSubscription?.cancel_at_period_end ||
      resolvedSubscription?.cancel_at ||
      resolvedSubscription?.canceled_at,
  );
  const subscriptionWithPeriods = resolvedSubscription as Stripe.Subscription & {
    current_period_end?: number | null;
    current_period_start?: number | null;
  } | null;

  const rawPeriodEnd =
    subscriptionWithPeriods?.current_period_end ??
    (resolvedSubscription?.cancel_at ?? null) ??
    (resolvedSubscription?.canceled_at ?? null) ??
    (resolvedSubscription?.ended_at ?? null);

  const rawPeriodStart =
    subscriptionWithPeriods?.current_period_start ??
    resolvedSubscription?.start_date ??
    null;

  const currentPeriodEnd = rawPeriodEnd
    ? new Date(rawPeriodEnd * 1000).toISOString()
    : null;
  const currentPeriodStart = rawPeriodStart
    ? new Date(rawPeriodStart * 1000).toISOString()
    : currentPeriodEnd;
  const priceId = derivePriceId(resolvedSubscription);

  const updatePayload: Record<string, unknown> = {
    stripe_customer_id: stripeCustomerId,
  };

  if (primaryProfileId) {
    updatePayload.primary_profile_id = primaryProfileId;
  }

  if (resolvedSubscription) {
    updatePayload.stripe_subscription_id = subscriptionId;
    updatePayload.stripe_subscription_status = subscriptionStatus;
    updatePayload.stripe_subscription_cancel_at_period_end = subscriptionCancelsAtPeriodEnd;
    updatePayload.premium_expires_at = currentPeriodEnd;
  }

  const { error: updateError } = await supabase
    .from("app_users")
    .update(updatePayload)
    .eq("auth0_sub", auth0Sub);

  if (updateError) {
    console.error("[premium] stripe sync failed to update app_user", updateError);
  }

  if (resolvedSubscription && (subscriptionId || stripeCustomerId)) {
    await upsertSubscriptionSnapshot(supabase, {
      auth0Sub,
      stripeCustomerId: stripeCustomerId ?? null,
      stripeSubscriptionId: subscriptionId,
      status: subscriptionStatus,
      cancelAtPeriodEnd: subscriptionCancelsAtPeriodEnd,
      currentPeriodStart,
      currentPeriodEnd,
      priceId,
    });
  } else if (!resolvedSubscription && !subscriptionId) {
    const { error: deleteError } = await supabase
      .from("premium_subscriptions")
      .delete()
      .eq("auth0_sub", auth0Sub);
    if (deleteError) {
      console.error("[premium] failed to clear subscription snapshot", deleteError);
    }
  }

  return {
    stripeCustomerId: stripeCustomerId ?? null,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: subscriptionStatus,
    stripeSubscriptionCancelAtPeriodEnd: subscriptionCancelsAtPeriodEnd,
    currentPeriodEnd,
    currentPeriodStart,
    primaryProfileId,
    priceId,
  };
}
