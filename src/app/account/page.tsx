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
import { AdvancedStatsIntentBanner } from "@/app/_components/AdvancedStatsIntentBanner";
import { ProfileSwitchPrompt } from "@/app/_components/ProfileSwitchPrompt";

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

const parseProfileIdParam = (value: string | string[] | undefined): number | null => {
  if (!value) return null;
  if (Array.isArray(value)) {
    for (const entry of value) {
      const parsed = parseProfileIdParam(entry);
      if (parsed) return parsed;
    }
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseBooleanParam = (value: string | string[] | undefined): boolean => {
  if (!value) return false;
  const evaluate = (token: string) => {
    const normalized = token.trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(normalized);
  };
  if (Array.isArray(value)) {
    return value.some((entry) => evaluate(entry));
  }
  return evaluate(value);
};

const formatProfileLabel = (alias: string | null, profileId: number | null) => {
  if (alias && alias.trim().length > 0) return alias.trim();
  if (profileId) return `Profile ${profileId}`;
  return "this profile";
};

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function AccountPage({ searchParams }: PageProps) {
  const session = await auth0.getSession();

  if (!session) {
    redirect(`/login?redirectTo=${encodeURIComponent("/account")}`);
  }

  const subscribeIntentActive = parseBooleanParam(
    (searchParams?.subscribe ?? searchParams?.subscribeIntent) as string | string[] | undefined,
  );

  let intentProfileId =
    parseProfileIdParam(searchParams?.profileId) ??
    parseProfileIdParam(searchParams?.profile_id) ??
    parseProfileIdParam(searchParams?.profileID) ??
    parseProfileIdParam(searchParams?.pid) ??
    null;

  let intentProfileAlias: string | null = null;
  let intentProfileCountry: string | null = null;
  let intentStatusMessage: string | null = null;
  let intentStatusTone: "info" | "success" | "warning" | "error" = "info";
  let switchPromptData: { profileId: number; alias: string | null; country: string | null } | null = null;

  const supabase = getSupabaseAdmin();

  const attemptLinkProfile = async (profileId: number) => {
    if (!supabase) {
      return { success: false as const, reason: "supabase_unavailable" as const };
    }

    const { data: player, error: playerError } = await supabase
      .from("players")
      .select("profile_id, current_alias, country")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (playerError) {
      console.error("[account] failed to fetch player for subscription intent", playerError);
    }

    if (!player) {
      return { success: false as const, reason: "player_not_found" as const };
    }

    const { error: linkError } = await upsertAppUser({
      supabase,
      auth0Sub: session.user.sub,
      email: sanitizeEmail(session.user.email ?? undefined),
      emailVerified: session.user.email_verified ?? null,
      additionalFields: {
        primary_profile_id: player.profile_id,
      },
    });

    if (linkError) {
      console.error("[account] failed to auto-link profile for subscription intent", linkError);
      return { success: false as const, reason: "link_failed" as const };
    }

    const { data: activation, error: activationError } = await supabase
      .from("premium_feature_activations")
      .select("expires_at")
      .eq("profile_id", profileId)
      .maybeSingle();

    if (activationError) {
      console.error("[account] failed to fetch activation for auto-linked profile", activationError);
    }

    return {
      success: true as const,
      alias: player.current_alias ?? null,
      country: player.country ?? null,
      activationExists: Boolean(activation),
      activationExpiresAt: activation?.expires_at ?? null,
    };
  };

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

    if (subscribeIntentActive && intentProfileId) {
      const { data: intentPlayer, error: intentPlayerError } = await supabase
        .from("players")
        .select("profile_id, current_alias, country")
        .eq("profile_id", intentProfileId)
        .maybeSingle();

      if (!intentPlayerError && intentPlayer) {
        intentProfileAlias = intentPlayer.current_alias ?? null;
        intentProfileCountry = intentPlayer.country ?? null;
      }
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

  const existingActivationActive =
    premiumForced ||
    (premiumActivationExists &&
      (!premiumActivationExpiresAt || isFutureDate(premiumActivationExpiresAt)));
  const existingAppUserPremiumActive = isFutureDate(premiumExpiresAt);
  const existingPremiumActive = existingActivationActive || existingAppUserPremiumActive;

  if (subscribeIntentActive) {
    if (!intentProfileId) {
      intentStatusMessage = "We couldn't determine which profile to link. Please select one below.";
      intentStatusTone = "error";
    } else {
      if (!primaryProfileId) {
        const linkResult = await attemptLinkProfile(intentProfileId);
        if (linkResult.success) {
          primaryProfileId = intentProfileId;
          profileAlias = linkResult.alias ?? profileAlias;
          intentProfileAlias = linkResult.alias ?? intentProfileAlias;
          profileCountry = linkResult.country ?? profileCountry;
          intentProfileCountry = linkResult.country ?? intentProfileCountry;
          premiumActivationExists = linkResult.activationExists ?? false;
          premiumActivationExpiresAt = linkResult.activationExpiresAt ?? null;
          premiumForced = isEnvForcedProfile(String(intentProfileId));
          premiumExpiresAt = null;
          intentStatusMessage = `Linked ${formatProfileLabel(intentProfileAlias, intentProfileId)} to your account. Start your subscription below.`;
          intentStatusTone = "success";
        } else if (linkResult.reason === "player_not_found") {
          intentStatusMessage = "We couldn't find that profile. Please try again from the search results.";
          intentStatusTone = "error";
        } else if (linkResult.reason === "supabase_unavailable") {
          intentStatusMessage = "Linking is currently unavailable. Please try again shortly.";
          intentStatusTone = "error";
        } else {
          intentStatusMessage = "We couldn't link the selected profile automatically. You can link it manually below.";
          intentStatusTone = "error";
        }
      } else if (primaryProfileId === intentProfileId) {
        intentStatusMessage = `You're ready to subscribe for ${formatProfileLabel(profileAlias, primaryProfileId)}.`;
        intentStatusTone = "info";
      } else if (existingPremiumActive) {
        switchPromptData = {
          profileId: intentProfileId,
          alias: intentProfileAlias,
          country: intentProfileCountry,
        };
        intentStatusMessage = `Premium is currently active for ${formatProfileLabel(profileAlias, primaryProfileId)}. Switch to ${formatProfileLabel(intentProfileAlias, intentProfileId)} to move your benefits.`;
        intentStatusTone = "warning";
      } else {
        const linkResult = await attemptLinkProfile(intentProfileId);
        if (linkResult.success) {
          primaryProfileId = intentProfileId;
          profileAlias = linkResult.alias ?? profileAlias;
          intentProfileAlias = linkResult.alias ?? intentProfileAlias;
          profileCountry = linkResult.country ?? profileCountry;
          intentProfileCountry = linkResult.country ?? intentProfileCountry;
          premiumActivationExists = linkResult.activationExists ?? false;
          premiumActivationExpiresAt = linkResult.activationExpiresAt ?? null;
          premiumForced = isEnvForcedProfile(String(intentProfileId));
          premiumExpiresAt = null;
          intentStatusMessage = `Linked ${formatProfileLabel(intentProfileAlias, intentProfileId)} to your account. Start your subscription below.`;
          intentStatusTone = "success";
        } else if (linkResult.reason === "player_not_found") {
          intentStatusMessage = "We couldn't find that profile. Please try again from the search results.";
          intentStatusTone = "error";
        } else if (linkResult.reason === "supabase_unavailable") {
          intentStatusMessage = "Linking is currently unavailable. Please try again shortly.";
          intentStatusTone = "error";
        } else {
          intentStatusMessage = "We couldn't link the selected profile automatically. You can link it manually below.";
          intentStatusTone = "error";
        }
      }
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
  const premiumSectionClassName = [
    "rounded-2xl border bg-neutral-900/80 p-6 shadow-lg",
    subscribeIntentActive ? "border-yellow-500/60 shadow-yellow-500/15" : "border-neutral-700/60",
  ].join(" ");
  const intentToneStyles = {
    success: "border-emerald-400/50 bg-emerald-400/15 text-emerald-100",
    error: "border-red-500/50 bg-red-500/15 text-red-200",
    warning: "border-amber-500/50 bg-amber-500/15 text-amber-100",
    info: "border-yellow-500/40 bg-yellow-500/10 text-yellow-100",
  } as const;
  const intentMessageClassName = intentToneStyles[intentStatusTone];

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

      {subscribeIntentActive && (
        <AdvancedStatsIntentBanner
          active={subscribeIntentActive}
          intentAlias={intentProfileAlias ?? profileAlias ?? (intentProfileId ? `Profile ${intentProfileId}` : null)}
        />
      )}

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

      <section id="premium-billing" className={premiumSectionClassName}>
        <h2 className="text-xl font-semibold text-white">Premium & Billing</h2>
        <p className="mt-2 text-sm text-neutral-400">
          Unlock advanced analytics and premium ladders with a monthly subscription.
        </p>
        {subscribeIntentActive && intentStatusMessage && !switchPromptData && (
          <div className={`mt-4 mb-4 rounded-xl border px-4 py-3 text-xs sm:text-sm ${intentMessageClassName}`}>
            {intentStatusMessage}
          </div>
        )}
        {switchPromptData && (
          <div className="mt-4">
            <ProfileSwitchPrompt
              targetProfileId={switchPromptData.profileId}
              targetAlias={switchPromptData.alias}
              targetCountry={switchPromptData.country}
              currentAlias={profileAlias ?? (primaryProfileId ? `Profile ${primaryProfileId}` : null)}
            />
          </div>
        )}
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
