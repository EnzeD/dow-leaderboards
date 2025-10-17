"use server";

import Stripe from "stripe";

const STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY ??
  process.env.STRIPE_API_KEY ??
  process.env.NEXT_STRIPE_SECRET_KEY ??
  null;

const STRIPE_API_VERSION: Stripe.LatestApiVersion = "2025-09-30.clover";

let stripeClient: Stripe | null = null;

const buildStripeClient = (): Stripe | null => {
  if (!STRIPE_SECRET_KEY) {
    return null;
  }

  return new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    appInfo: {
      name: "dow-leaderboards",
    },
  });
};

export async function getStripe(): Promise<Stripe> {
  if (!stripeClient) {
    stripeClient = buildStripeClient();
  }

  if (!stripeClient) {
    throw new Error("Stripe is not configured");
  }

  return stripeClient;
}
