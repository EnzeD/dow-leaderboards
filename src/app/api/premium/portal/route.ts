"use server";

import { NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { getStripe } from "@/lib/stripe";
import { getSupabaseAdmin } from "@/lib/premium/activation-server";

const resolveReturnUrl = () => {
  const configured =
    process.env.STRIPE_PORTAL_RETURN_URL ??
    process.env.NEXT_PUBLIC_STRIPE_PORTAL_RETURN_URL;
  if (configured) {
    try {
      return new URL(configured).toString();
    } catch {
      console.warn("[premium/portal] invalid STRIPE_PORTAL_RETURN_URL", configured);
    }
  }

  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.APP_BASE_URL ??
    "http://localhost:3000";
  try {
    const url = new URL(raw);
    return `${url.origin}/account`;
  } catch {
    return "http://localhost:3000/account";
  }
};

export async function POST() {
  const session = await auth0.getSession();

  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json({ error: "supabase_unavailable" }, { status: 500 });
  }

  const { data: appUser, error } = await supabase
    .from("app_users")
    .select("stripe_customer_id")
    .eq("auth0_sub", session.user.sub)
    .maybeSingle();

  if (error) {
    console.error("[premium/portal] failed to load app_user", error);
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 });
  }

  const stripeCustomerId = appUser?.stripe_customer_id ?? null;

  if (!stripeCustomerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const stripe = await getStripe();

  try {
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: resolveReturnUrl(),
    });

    return NextResponse.json({ url: portalSession.url }, { status: 200 });
  } catch (err) {
    console.error("[premium/portal] failed to create billing portal session", err);
    return NextResponse.json({ error: "portal_creation_failed" }, { status: 500 });
  }
}
