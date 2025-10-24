"use server";

import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getStripe } from "@/lib/stripe";
import { sanitizeEmail, upsertAppUser } from "@/lib/app-users";
import { getSupabaseAdmin } from "@/lib/premium/subscription-server";

const resolveBaseUrl = () => {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_BASE_URL ??
    "http://localhost:3000";
  try {
    const url = new URL(raw);
    const normalized =
      url.origin + (url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`);
    return normalized.replace(/\/+$/, "/");
  } catch {
    return "http://localhost:3000/";
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

const priceId =
  process.env.STRIPE_PRICE_ID ??
  process.env.NEXT_PUBLIC_STRIPE_PRICE_ID ??
  null;

export async function POST(request: Request) {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  if (!priceId) {
    return NextResponse.json({ error: "stripe_price_unconfigured" }, { status: 500 });
  }

  const stripe = await getStripe();
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const requestedProfileId =
    parseProfileId(body?.profileId) ??
    parseProfileId(body?.profile_id) ??
    parseProfileId(body?.profileID);
  const requestedSuccessUrl = typeof body?.successUrl === "string" ? body.successUrl : null;
  const requestedCancelUrl = typeof body?.cancelUrl === "string" ? body.cancelUrl : null;

  const { data: appUser, error: lookupError } = await supabase
    .from("app_users")
    .select("primary_profile_id, stripe_customer_id, has_used_trial")
    .eq("auth0_sub", session.user.sub)
    .maybeSingle();

  if (lookupError) {
    console.error("[premium/checkout] failed to load app user", lookupError);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  // Check if user already used trial
  const hasUsedTrial = appUser?.has_used_trial ?? false;

  if (hasUsedTrial) {
    return NextResponse.json({
      error: "trial_already_used",
      message: "You've already used your free trial. You can still subscribe for $4.99/month."
    }, { status: 400 });
  }

  const profileId =
    requestedProfileId ??
    (appUser?.primary_profile_id ? Number.parseInt(String(appUser.primary_profile_id), 10) : null);

  if (!profileId) {
    return NextResponse.json({ error: "profile_required" }, { status: 400 });
  }

  const email = sanitizeEmail(session.user.email ?? undefined);
  const metadata: Record<string, string> = {
    profile_id: String(profileId),
    auth0_sub: session.user.sub,
  };

  let customerId = appUser?.stripe_customer_id ?? null;

  if (customerId) {
    try {
      await stripe.customers.retrieve(customerId);
    } catch (error) {
      console.warn("[premium/checkout] existing customer lookup failed, creating new customer", {
        customerId,
        error,
      });
      customerId = null;
    }
  }

  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: email ?? undefined,
        metadata,
      });
      customerId = customer.id;
    } catch (error) {
      console.error("[premium/checkout] failed to create customer", error);
      return NextResponse.json({ error: "customer_creation_failed" }, { status: 500 });
    }
  } else {
    try {
      await stripe.customers.update(customerId, {
        email: email ?? undefined,
        metadata,
      });
    } catch (error) {
      console.warn("[premium/checkout] failed to update customer metadata", {
        customerId,
        error,
      });
    }
  }

  const baseUrl = resolveBaseUrl();
  const baseUrlParsed = new URL(baseUrl);

  const sanitizeReturnUrl = (value: string | null, options?: { allowSessionPlaceholder?: boolean }) => {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.origin !== baseUrlParsed.origin) return null;
      if (!options?.allowSessionPlaceholder) {
        url.searchParams.delete("session_id");
      }
      return url.toString();
    } catch {
      return null;
    }
  };

  const successUrl = sanitizeReturnUrl(requestedSuccessUrl, { allowSessionPlaceholder: true }) ?? `${baseUrl}account?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = sanitizeReturnUrl(requestedCancelUrl) ?? `${baseUrl}account?checkout=cancelled`;

  let checkoutSessionUrl: string | null = null;

  try {
    const sessionResult = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId ?? undefined,
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata,
      subscription_data: {
        metadata,
        trial_period_days: 7,
      },
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      client_reference_id: String(profileId),
    });

    checkoutSessionUrl = sessionResult.url ?? null;
  } catch (error) {
    console.error("[premium/checkout] failed to create checkout session", error);
    return NextResponse.json({ error: "checkout_creation_failed" }, { status: 500 });
  }

  if (!checkoutSessionUrl) {
    return NextResponse.json({ error: "checkout_missing_url" }, { status: 500 });
  }

  const { error: upsertError } = await upsertAppUser({
    supabase,
    auth0Sub: session.user.sub,
    email,
    emailVerified: session.user.email_verified ?? null,
    additionalFields: {
      primary_profile_id: profileId,
      stripe_customer_id: customerId,
      stripe_subscription_id: null,
      stripe_subscription_status: null,
      stripe_subscription_cancel_at_period_end: null,
      premium_expires_at: null,
    },
  });

  if (upsertError) {
    console.error("[premium/checkout] failed to persist app user linkage", upsertError);
  }

  return NextResponse.json({ url: checkoutSessionUrl }, { status: 200 });
}
