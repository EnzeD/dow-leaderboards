"use server";

import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/premium/activation-server";

const webhookSecret =
  process.env.STRIPE_WEBHOOK_SECRET ??
  process.env.STRIPE_SIGNING_SECRET ??
  null;

const isSubscriptionActive = (status: Stripe.Subscription.Status) => {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return true;
    default:
      return false;
  }
};

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

const getCustomerId = (customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined): string | null => {
  if (!customer) return null;
  if (typeof customer === "string") return customer;
  if ("deleted" in customer && customer.deleted) return null;
  return customer.id;
};

const updatePremiumForSubscription = async (
  subscription: Stripe.Subscription,
) => {
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    console.error("[stripe/webhook] Supabase admin client unavailable");
    return;
  }

  const stripeCustomerId = getCustomerId(subscription.customer);
  const stripeSubscriptionId = subscription.id;
  const auth0Sub = subscription.metadata?.auth0_sub ?? subscription.metadata?.auth0Sub ?? subscription.metadata?.auth0SubId ?? null;
  const profileId =
    parseProfileId(subscription.metadata?.profile_id) ??
    parseProfileId(subscription.metadata?.profileId) ??
    parseProfileId(subscription.metadata?.profileID) ??
    null;

  let resolvedProfileId = profileId;
  let resolvedAuth0Sub = auth0Sub;

  const filters: Array<{ column: string; value: string | number }> = [];

  if (resolvedAuth0Sub) {
    filters.push({ column: "auth0_sub", value: resolvedAuth0Sub });
  }

  if (stripeCustomerId) {
    filters.push({ column: "stripe_customer_id", value: stripeCustomerId });
  }

  if (resolvedProfileId) {
    filters.push({ column: "primary_profile_id", value: resolvedProfileId });
  }

  let appUser:
    | {
        auth0_sub: string;
        primary_profile_id: number | null;
      }
    | null = null;

  for (const filter of filters) {
    const { data, error } = await supabase
      .from("app_users")
      .select("auth0_sub, primary_profile_id")
      .eq(filter.column, filter.value)
      .maybeSingle();

    if (error) {
      console.error("[stripe/webhook] failed to resolve app_user", {
        filter,
        error,
      });
      continue;
    }

    if (data) {
      appUser = {
        auth0_sub: data.auth0_sub,
        primary_profile_id: data.primary_profile_id ?? null,
      };
      break;
    }
  }

  if (appUser) {
    resolvedAuth0Sub = appUser.auth0_sub;
    if (!resolvedProfileId && appUser.primary_profile_id) {
      resolvedProfileId = Number.parseInt(String(appUser.primary_profile_id), 10);
    }
  }

  const subscriptionWithPeriods = subscription as Stripe.Subscription & {
    current_period_end?: number | null;
    current_period_start?: number | null;
  };

  const periodEnd = subscriptionWithPeriods.current_period_end
    ? new Date(subscriptionWithPeriods.current_period_end * 1000).toISOString()
    : null;
  const periodStart = subscriptionWithPeriods.current_period_start
    ? new Date(subscriptionWithPeriods.current_period_start * 1000).toISOString()
    : new Date().toISOString();

  const active = isSubscriptionActive(subscription.status);

  const updatePayload: Record<string, unknown> = {
    stripe_customer_id: stripeCustomerId,
    stripe_subscription_id: active ? stripeSubscriptionId : null,
    stripe_subscription_status: subscription.status,
    stripe_subscription_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    premium_expires_at: periodEnd,
  };

  if (resolvedProfileId) {
    updatePayload.primary_profile_id = resolvedProfileId;
  }

  if (resolvedAuth0Sub) {
    const { error } = await supabase
      .from("app_users")
      .update(updatePayload)
      .eq("auth0_sub", resolvedAuth0Sub);

    if (error) {
      console.error("[stripe/webhook] failed to update app_user by auth0_sub", error);
    }
  } else if (stripeCustomerId) {
    const { error } = await supabase
      .from("app_users")
      .update(updatePayload)
      .eq("stripe_customer_id", stripeCustomerId);

    if (error) {
      console.error("[stripe/webhook] failed to update app_user by customer id", error);
    }
  }

  if (!resolvedProfileId) {
    console.warn("[stripe/webhook] unable to resolve profile_id from subscription", {
      subscriptionId: subscription.id,
    });
    return;
  }

  if (active) {
    const { error } = await supabase
      .from("premium_feature_activations")
      .upsert(
        {
          profile_id: resolvedProfileId,
          activated_at: periodStart,
          expires_at: periodEnd,
          notes: "stripe_auto",
        },
        { onConflict: "profile_id" },
      );

    if (error) {
      console.error("[stripe/webhook] failed to upsert premium activation", error);
    }
  } else {
    const { error } = await supabase
      .from("premium_feature_activations")
      .upsert(
        {
          profile_id: resolvedProfileId,
          activated_at: periodStart,
          expires_at: periodEnd ?? new Date().toISOString(),
          notes: "stripe_auto",
        },
        { onConflict: "profile_id" },
      );

    if (error) {
      console.error("[stripe/webhook] failed to expire premium activation", error);
    }
  }
};

export async function POST(request: NextRequest) {
  if (!webhookSecret) {
    console.error("[stripe/webhook] missing STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "webhook_unconfigured" }, { status: 500 });
  }

  const stripe = await getStripe();

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
  } catch (error) {
    console.error("[stripe/webhook] signature verification failed", error);
    return NextResponse.json({ error: "signature_verification_failed" }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        await updatePremiumForSubscription(subscription);
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (typeof session.subscription === "string") {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          await updatePremiumForSubscription(subscription);
        } else if (session.subscription) {
          await updatePremiumForSubscription(session.subscription as Stripe.Subscription);
        }
        break;
      }
      default: {
        // Intentionally ignore other event types for now
        break;
      }
    }
  } catch (error) {
    console.error("[stripe/webhook] handler failed", {
      eventType: event.type,
      error,
    });
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
