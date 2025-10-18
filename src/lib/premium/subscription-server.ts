import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type SubscriptionSnapshot = {
  auth0_sub: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_start: string | null;
  current_period_end: string | null;
  price_id: string | null;
};

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabaseAdmin: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

export const getSupabaseAdmin = () => supabaseAdmin;

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export const isStripeSubscriptionActive = (
  snapshot: Pick<
    SubscriptionSnapshot,
    "status" | "cancel_at_period_end" | "current_period_end"
  > | null,
): boolean => {
  if (!snapshot) return false;
  if (!snapshot.status || !ACTIVE_STATUSES.has(snapshot.status)) {
    return false;
  }

  if (!snapshot.current_period_end) {
    return true;
  }

  const expiry = Date.parse(snapshot.current_period_end);
  if (Number.isNaN(expiry)) {
    return false;
  }

  return expiry > Date.now();
};

export const fetchSubscriptionSnapshot = async (
  supabase: SupabaseClient,
  auth0Sub: string,
): Promise<SubscriptionSnapshot | null> => {
  const { data, error } = await supabase
    .from("premium_subscriptions")
    .select(
      "auth0_sub, stripe_customer_id, stripe_subscription_id, status, cancel_at_period_end, current_period_start, current_period_end, price_id",
    )
    .eq("auth0_sub", auth0Sub)
    .maybeSingle();

  if (error) {
    console.error("[premium] failed to fetch subscription snapshot", error);
    return null;
  }

  if (!data) return null;

  return {
    auth0_sub: data.auth0_sub,
    stripe_customer_id: data.stripe_customer_id ?? null,
    stripe_subscription_id: data.stripe_subscription_id ?? null,
    status: data.status ?? null,
    cancel_at_period_end: data.cancel_at_period_end ?? null,
    current_period_start: data.current_period_start ?? null,
    current_period_end: data.current_period_end ?? null,
    price_id: data.price_id ?? null,
  };
};

type UpsertSubscriptionPayload = {
  auth0Sub: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  priceId: string | null;
};

export const upsertSubscriptionSnapshot = async (
  supabase: SupabaseClient,
  payload: UpsertSubscriptionPayload,
) => {
  const attemptUpsert = async () =>
    supabase
      .from("premium_subscriptions")
      .upsert(
        {
          auth0_sub: payload.auth0Sub,
          stripe_customer_id: payload.stripeCustomerId,
          stripe_subscription_id: payload.stripeSubscriptionId,
          status: payload.status,
          cancel_at_period_end: payload.cancelAtPeriodEnd,
          current_period_start: payload.currentPeriodStart,
          current_period_end: payload.currentPeriodEnd,
          price_id: payload.priceId,
        },
        { onConflict: "auth0_sub" },
      );

  let { error } = await attemptUpsert();

  if (error?.code === "23503") {
    const { error: ensureError } = await supabase
      .from("app_users")
      .upsert({ auth0_sub: payload.auth0Sub }, { onConflict: "auth0_sub" });

    if (ensureError) {
      console.error("[premium] failed to ensure app_user before snapshot upsert", ensureError);
      return;
    }

    const retry = await attemptUpsert();
    error = retry.error;
  }

  if (error) {
    console.error("[premium] failed to upsert subscription snapshot", error);
  }
};

export const attachCacheHeaders = (response: Response) => {
  response.headers.set("Cache-Control", "private, max-age=0, s-maxage=30");
  response.headers.set("Content-Type", "application/json");
  return response;
};

export const resolveSinceDate = (windowDays?: number | null): string => {
  const days =
    windowDays && Number.isFinite(windowDays) && windowDays > 0
      ? Math.min(windowDays, 365)
      : 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return since.toISOString();
};
