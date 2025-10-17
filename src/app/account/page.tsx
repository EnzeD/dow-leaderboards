import Link from "next/link";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { getSupabaseAdmin, isEnvForcedProfile } from "@/lib/premium/activation-server";
import { DeleteAccountButton } from "@/app/_components/DeleteAccountButton";
import { AccountProfileLinker } from "@/app/_components/AccountProfileLinker";
import { sanitizeEmail, upsertAppUser } from "@/lib/app-users";
import {
  GoPremiumButton,
  ManageSubscriptionButton,
} from "@/app/_components/premium/GoPremiumButton";
import { syncStripeSubscription } from "@/lib/premium/stripe-sync";

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

const isFutureDate = (iso: string | null | undefined): boolean => {
  if (!iso) return false;
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return false;
  return parsed > Date.now();
};

const isStripeSubscriptionActive = (status: string | null | undefined): boolean => {
  if (!status) return false;
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
      return true;
    default:
      return false;
  }
};

const resolveCheckoutSessionId = (
  params?: Record<string, string | string[] | undefined>,
): string | null => {
  if (!params) return null;
  const raw =
    params.session_id ??
    params.sessionId ??
    params.sessionID ??
    null;

  if (!raw) return null;
  if (Array.isArray(raw)) {
    return raw.length > 0 ? raw[0] ?? null : null;
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  return null;
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AccountPage({ searchParams }: PageProps) {
  const session = await auth0.getSession();

  if (!session) {
    redirect(`/login?redirectTo=${encodeURIComponent("/account")}`);
  }

  const supabase = getSupabaseAdmin();

  let premiumExpiresAt: string | null = null;
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionStatus: string | null = null;
  let stripeSubscriptionCancelAtPeriodEnd = false;
  let primaryProfileId: number | null = null;
  let profileAlias: string | null = null;
  let profileCountry: string | null = null;
  let premiumActivationExpiresAt: string | null = null;
  let premiumActivationExists = false;
  let premiumForced = false;

  if (supabase) {
    const { error: upsertError } = await upsertAppUser({
      supabase,
      auth0Sub: session.user.sub,
      email: sanitizeEmail(session.user.email ?? undefined),
      emailVerified: session.user.email_verified ?? null,
    });

    if (upsertError) {
      console.error("[account] failed to sync app_users", upsertError);
    }

    const { data, error } = await supabase
      .from("app_users")
      .select(
        "premium_expires_at, stripe_customer_id, stripe_subscription_status, stripe_subscription_cancel_at_period_end, primary_profile_id",
      )
      .eq("auth0_sub", session.user.sub)
      .maybeSingle();

    if (!error && data) {
      premiumExpiresAt = data.premium_expires_at ?? null;
      stripeCustomerId = data.stripe_customer_id ?? null;
      stripeSubscriptionStatus = data.stripe_subscription_status ?? null;
      stripeSubscriptionCancelAtPeriodEnd = Boolean(
        data.stripe_subscription_cancel_at_period_end,
      );
      primaryProfileId = data.primary_profile_id
        ? Number.parseInt(String(data.primary_profile_id), 10)
        : null;

      if (primaryProfileId) {
        premiumForced = isEnvForcedProfile(String(primaryProfileId));

        const { data: player, error: playerError } = await supabase
          .from("players")
          .select("profile_id, current_alias, country")
          .eq("profile_id", primaryProfileId)
          .maybeSingle();

        if (!playerError && player) {
          profileAlias = player.current_alias ?? null;
          profileCountry = player.country ?? null;
        }

        const { data: activation, error: activationError } = await supabase
          .from("premium_feature_activations")
          .select("expires_at")
          .eq("profile_id", primaryProfileId)
          .maybeSingle();

        if (!activationError && activation) {
          premiumActivationExists = true;
          premiumActivationExpiresAt = activation.expires_at ?? null;
        }
      }
    }
  }

  const checkoutSessionId = resolveCheckoutSessionId(searchParams);

  if (supabase && !premiumForced && (stripeCustomerId || checkoutSessionId)) {
    const syncResult = await syncStripeSubscription({
      auth0Sub: session.user.sub,
      checkoutSessionId,
      existingCustomerId: stripeCustomerId ?? undefined,
    });

    if (syncResult) {
      stripeCustomerId = syncResult.stripeCustomerId ?? stripeCustomerId;
      stripeSubscriptionStatus =
        syncResult.stripeSubscriptionStatus ?? stripeSubscriptionStatus;
      stripeSubscriptionCancelAtPeriodEnd =
        syncResult.stripeSubscriptionCancelAtPeriodEnd;
      premiumExpiresAt = syncResult.premiumExpiresAt ?? premiumExpiresAt;
      premiumActivationExists = syncResult.premiumActivationExists;
      premiumActivationExpiresAt =
        syncResult.premiumActivationExpiresAt ?? premiumActivationExpiresAt;
      primaryProfileId = syncResult.primaryProfileId ?? primaryProfileId;
    }
  }

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

  const baseUrl = resolveBaseUrl();
  const logoutUrl = `/auth/logout?returnTo=${encodeURIComponent(baseUrl)}`;
  const activationActive =
    premiumForced ||
    (premiumActivationExists &&
      (!premiumActivationExpiresAt || isFutureDate(premiumActivationExpiresAt)));
  const appUserPremiumActive = isFutureDate(premiumExpiresAt);
  const premiumActive = activationActive || appUserPremiumActive;
  const hasStripeCustomer = Boolean(stripeCustomerId);
  const checkoutStatusRaw = searchParams?.checkout;
  const checkoutStatus = Array.isArray(checkoutStatusRaw)
    ? checkoutStatusRaw[0]
    : checkoutStatusRaw;
  const pendingActivation =
    !premiumActive &&
    hasStripeCustomer &&
    ((checkoutStatus === "success" && !premiumExpiresAt) ||
      stripeSubscriptionStatus === "incomplete" ||
      stripeSubscriptionStatus === "incomplete_expired");
  const subscriptionRenewing =
    premiumActive &&
    !stripeSubscriptionCancelAtPeriodEnd &&
    isStripeSubscriptionActive(stripeSubscriptionStatus);
  const accountStatusLabel = premiumActive
    ? "Premium account"
    : pendingActivation
      ? "Premium account (activation pending)"
      : "Free account";
  const effectivePremiumExpiry = premiumExpiresAt ?? premiumActivationExpiresAt;
  const showManageButton = hasStripeCustomer;
  const showGoPremium = !premiumActive;
  const hasRenewalDate = Boolean(effectivePremiumExpiry);
  const expiryLabel = subscriptionRenewing ? "Subscription renews" : "Premium expires";
  const expiryValueClass = hasRenewalDate
    ? subscriptionRenewing
      ? "text-base font-semibold text-emerald-200"
      : "text-base font-semibold text-red-300"
    : "text-base font-medium text-white";
  const expiryDisplayValue = hasRenewalDate
    ? formatDateTime(effectivePremiumExpiry)
    : "—";
  const premiumStatusNote = subscriptionRenewing
    ? "Premium benefits renew automatically for your linked profile."
    : premiumActive
      ? "Premium benefits remain active until your expiry."
      : null;
  const premiumStatusTone = subscriptionRenewing ? "text-emerald-300" : "text-amber-300";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10 text-neutral-100">
      <header className="flex flex-col gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start rounded-lg border border-neutral-700/50 bg-neutral-900/60 px-3 py-1.5 text-sm font-medium text-neutral-200 transition hover:bg-neutral-800/60"
        >
          <span aria-hidden className="text-lg">←</span>
          Back to leaderboards
        </Link>
        <h1 className="text-3xl font-semibold text-white">Account</h1>
        <p className="text-sm text-neutral-400">
          Manage your login, subscription, and premium analytics access.
        </p>
      </header>

      {checkoutStatus === "success" && (
        <div className="rounded-2xl border border-emerald-500/50 bg-emerald-500/15 px-6 py-4 text-sm text-emerald-100 shadow-lg">
          Subscription confirmed! Stripe will finalise your payment shortly, and premium access unlocks automatically.
        </div>
      )}

      {checkoutStatus === "cancelled" && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-4 text-sm text-amber-100 shadow-lg">
          Checkout cancelled. You can try again anytime using the Go Premium button below.
        </div>
      )}

      <section className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-white">Profile</h2>
        <dl className="mt-4 grid gap-3 text-sm text-neutral-300 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Email
            </dt>
            <dd className="mt-1 text-base font-medium text-white">
              {session.user.email ?? "—"}
            </dd>
            <dd className="mt-1 text-xs text-neutral-400">
              {session.user.email_verified ? "Verified" : "Not verified"}
            </dd>
          </div>
          <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Linked profile
            </dt>
            <dd className="mt-1 text-base font-medium text-white">
              {profileAlias ?? primaryProfileId ?? "—"}
            </dd>
            {profileCountry && (
              <dd className="mt-1 text-xs text-neutral-400">
                {profileCountry.toUpperCase()}
              </dd>
            )}
          </div>
        </dl>
      </section>

      <section className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-white">Link Dawn of War Profile</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Connect your in-game profile to unlock personalised insights and premium analytics.
        </p>
        <div className="mt-5">
          <AccountProfileLinker
            initialProfileId={primaryProfileId}
            initialAlias={profileAlias}
            initialCountry={profileCountry}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-white">Premium & Billing</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Unlock advanced analytics and premium ladders with a monthly subscription.
        </p>
        <dl className="mt-4 grid gap-3 text-sm text-neutral-300 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Status
            </dt>
            <dd className="mt-1 text-base font-semibold text-white">
              {accountStatusLabel}
            </dd>
          </div>
          <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              {expiryLabel}
            </dt>
            <dd className={`mt-1 ${expiryValueClass}`}>
              {expiryDisplayValue}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
          {showGoPremium && !pendingActivation && (
            <GoPremiumButton
              profileId={primaryProfileId}
              premiumExpiresAt={effectivePremiumExpiry}
              isPremiumActive={premiumActive}
            />
          )}
          {showManageButton && (
            <ManageSubscriptionButton stripeCustomerId={stripeCustomerId} />
          )}
          {pendingActivation && (
            <span className="text-xs text-amber-300">
              Activation pending — refresh after a minute or open the billing portal to verify your payment.
            </span>
          )}
          {premiumStatusNote && !pendingActivation && (
            <span className={`text-xs ${premiumStatusTone}`}>
              {premiumStatusNote}
            </span>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-6 shadow-lg">
        <h2 className="text-xl font-semibold text-white">Actions</h2>
        <div className="mt-4 flex flex-col gap-4 text-sm text-neutral-300 md:flex-row">
          <a
            href={logoutUrl}
            className="inline-flex items-center justify-center rounded-lg border border-neutral-600/50 bg-neutral-800/40 px-5 py-2 font-semibold text-neutral-100 transition hover:bg-neutral-700/60"
          >
            Log out
          </a>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg border border-neutral-600/50 bg-neutral-800/40 px-5 py-2 font-semibold text-neutral-100 transition hover:bg-neutral-700/60"
          >
            Back to leaderboards
          </Link>
          <DeleteAccountButton logoutUrl={logoutUrl} />
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Deleting your account removes premium access, billing associations, and disconnects your login. This action is irreversible.
        </p>
      </section>
    </div>
  );
}
