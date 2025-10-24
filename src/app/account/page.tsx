import Link from "next/link";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import {
  fetchSubscriptionSnapshot,
  getSupabaseAdmin,
  isStripeSubscriptionActive as isSubscriptionSnapshotActive,
} from "@/lib/premium/subscription-server";
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
import { AccountRefresher } from "@/app/_components/AccountRefresher";
import { PortalReturnHandler } from "@/app/_components/PortalReturnHandler";
import { ProBadgeToggle } from "@/app/_components/ProBadgeToggle";
import ProBadge from "@/components/ProBadge";

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

const isValidCheckoutSessionId = (value: string | null | undefined) => {
  if (!value) return false;
  return /^cs_(?:test|live)_[A-Za-z0-9]+$/.test(value);
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
    const candidate = raw.length > 0 ? raw[0] ?? null : null;
    return isValidCheckoutSessionId(candidate) ? candidate : null;
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    const trimmed = raw.trim();
    return isValidCheckoutSessionId(trimmed) ? trimmed : null;
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

  // Parse returnTo parameter for post-subscription redirect
  const returnToProfileId = parseProfileIdParam(searchParams?.returnTo) ?? null;

  // Treat returnTo as automatic subscription intent
  const subscribeIntentActive = returnToProfileId !== null || parseBooleanParam(
    (searchParams?.subscribe ?? searchParams?.subscribeIntent) as string | string[] | undefined,
  );

  let intentProfileId =
    returnToProfileId ??
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

    return {
      success: true as const,
      alias: player.current_alias ?? null,
      country: player.country ?? null,
    };
  };

  let stripeCustomerId: string | null = null;
  let stripeSubscriptionStatus: string | null = null;
  let stripeSubscriptionCancelAtPeriodEnd: boolean | null = null;
  let subscriptionCurrentPeriodEnd: string | null = null;
  let primaryProfileId: number | null = null;
  let profileAlias: string | null = null;
  let profileCountry: string | null = null;
  let profileAvatarUrl: string | null = null;
  let hasUsedTrial: boolean = false;

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
        "premium_expires_at, stripe_customer_id, stripe_subscription_status, stripe_subscription_cancel_at_period_end, primary_profile_id, has_used_trial",
      )
      .eq("auth0_sub", session.user.sub)
      .maybeSingle();

    if (!error && data) {
      subscriptionCurrentPeriodEnd = data.premium_expires_at ?? null;
      stripeCustomerId = data.stripe_customer_id ?? null;
      stripeSubscriptionStatus = data.stripe_subscription_status ?? null;
      stripeSubscriptionCancelAtPeriodEnd =
        data.stripe_subscription_cancel_at_period_end ?? null;
      primaryProfileId = data.primary_profile_id
        ? Number.parseInt(String(data.primary_profile_id), 10)
        : null;
      hasUsedTrial = data.has_used_trial ?? false;

      if (primaryProfileId) {
        const { data: player, error: playerError } = await supabase
          .from("players")
          .select("profile_id, current_alias, country, steam_id64")
          .eq("profile_id", primaryProfileId)
          .maybeSingle();

        if (!playerError && player) {
          profileAlias = player.current_alias ?? null;
          profileCountry = player.country ?? null;

          // Fetch Steam avatar if available
          if (player.steam_id64) {
            const { fetchSteamSummaryByProfile } = await import("@/lib/steam");
            const summary = await fetchSteamSummaryByProfile(
              player.profile_id,
              player.steam_id64
            );
            if (summary) {
              profileAvatarUrl =
                summary.avatarFull ??
                summary.avatarMedium ??
                summary.avatar ??
                null;
            }
          }
        }
      }

      const snapshot = await fetchSubscriptionSnapshot(supabase, session.user.sub);
      if (snapshot) {
        stripeCustomerId = snapshot.stripe_customer_id ?? stripeCustomerId;
        stripeSubscriptionStatus = snapshot.status ?? stripeSubscriptionStatus;
        stripeSubscriptionCancelAtPeriodEnd =
          snapshot.cancel_at_period_end ?? stripeSubscriptionCancelAtPeriodEnd;
        subscriptionCurrentPeriodEnd =
          snapshot.current_period_end ?? subscriptionCurrentPeriodEnd;
      }
    }
  }

  const checkoutSessionId = resolveCheckoutSessionId(searchParams);
  const fromPortal = parseBooleanParam(searchParams?.fromPortal);

  if (supabase && (stripeCustomerId || checkoutSessionId || fromPortal)) {
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
      subscriptionCurrentPeriodEnd =
        syncResult.currentPeriodEnd ?? subscriptionCurrentPeriodEnd;
      primaryProfileId = syncResult.primaryProfileId ?? primaryProfileId;
    }

    const refreshedSnapshot = await fetchSubscriptionSnapshot(supabase, session.user.sub);
    if (refreshedSnapshot) {
      stripeCustomerId = refreshedSnapshot.stripe_customer_id ?? stripeCustomerId;
      stripeSubscriptionStatus = refreshedSnapshot.status ?? stripeSubscriptionStatus;
      stripeSubscriptionCancelAtPeriodEnd =
        refreshedSnapshot.cancel_at_period_end ?? stripeSubscriptionCancelAtPeriodEnd;
      subscriptionCurrentPeriodEnd =
        refreshedSnapshot.current_period_end ?? subscriptionCurrentPeriodEnd;
    }
  }

  let subscriptionActive = isSubscriptionSnapshotActive({
    status: stripeSubscriptionStatus ?? null,
    cancel_at_period_end: stripeSubscriptionCancelAtPeriodEnd ?? null,
    current_period_end: subscriptionCurrentPeriodEnd ?? null,
  });

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
          subscriptionCurrentPeriodEnd = null;
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
      } else if (subscriptionActive) {
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
          subscriptionCurrentPeriodEnd = null;
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

  subscriptionActive = primaryProfileId
    ? isSubscriptionSnapshotActive({
        status: stripeSubscriptionStatus ?? null,
        cancel_at_period_end: stripeSubscriptionCancelAtPeriodEnd ?? null,
        current_period_end: subscriptionCurrentPeriodEnd ?? null,
      })
    : false;

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
  const hasStripeCustomer = Boolean(stripeCustomerId);
  const checkoutStatusRaw = searchParams?.checkout;
  const checkoutStatus = Array.isArray(checkoutStatusRaw)
    ? checkoutStatusRaw[0]
    : checkoutStatusRaw;

  // Redirect to profile page after successful checkout if returnTo is present
  if (checkoutStatus === "success" && returnToProfileId && supabase) {
    // Fetch profile name for better redirect
    const { data: profileData } = await supabase
      .from("players")
      .select("current_alias, profile_id")
      .eq("profile_id", returnToProfileId)
      .maybeSingle();

    const profileName = profileData?.current_alias || `Profile ${returnToProfileId}`;
    redirect(`/?tab=search&q=${encodeURIComponent(profileName)}&pid=${returnToProfileId}`);
  }

  const pendingActivation =
    !subscriptionActive &&
    hasStripeCustomer &&
    (checkoutStatus === "success" ||
      stripeSubscriptionStatus === "incomplete" ||
      stripeSubscriptionStatus === "incomplete_expired");
  const cancelAtPeriodEnd = Boolean(stripeSubscriptionCancelAtPeriodEnd);
  const subscriptionRenewing = subscriptionActive && !cancelAtPeriodEnd;
  const isTrialing = stripeSubscriptionStatus === "trialing";
  const isTrialEligible = !hasUsedTrial && !subscriptionActive;
  const accountStatusLabel = subscriptionActive
    ? isTrialing
      ? "Pro member (trial)"
      : cancelAtPeriodEnd
        ? "Pro member (will expire)"
        : "Pro member"
    : pendingActivation
      ? "Pro member (activation pending)"
      : "Free account";
  const effectivePremiumExpiry = subscriptionCurrentPeriodEnd;
  const showManageButton = hasStripeCustomer;
  const showGoPremium = !subscriptionActive;
  const hasRenewalDate = Boolean(effectivePremiumExpiry);
  const expiryLabel = subscriptionRenewing ? "Pro membership renews" : "Pro membership expires";
  const expiryValueClass = hasRenewalDate
    ? subscriptionRenewing
      ? "text-base font-semibold text-emerald-200"
      : "text-base font-semibold text-red-300"
    : "text-base font-medium text-white";
  const expiryDisplayValue = hasRenewalDate
    ? formatDateTime(effectivePremiumExpiry)
    : "—";
  const premiumStatusNote = subscriptionRenewing
    ? "Pro membership renews automatically for your linked profile."
    : subscriptionActive
      ? "Pro membership remains active until your expiry."
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

  const shouldRefreshSession =
    checkoutStatus === "success" ||
    (subscribeIntentActive && intentStatusTone === "success") ||
    Boolean(checkoutSessionId) ||
    fromPortal;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-10 text-neutral-100">
      <AccountRefresher shouldRefresh={shouldRefreshSession} />
      <PortalReturnHandler />
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
          Manage your login, Pro membership, and analytics access.
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
          Welcome to Dow: DE Pro! Your free trial has started. You&apos;ll be charged after 7 days unless you cancel.
        </div>
      )}

      {checkoutStatus === "cancelled" && (
        <div className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-6 py-4 text-sm text-amber-100 shadow-lg">
          Checkout cancelled. You can start your free Pro trial anytime below.
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
          Connect your in-game profile to unlock Pro analytics.
        </p>
        <div className="mt-5">
          <AccountProfileLinker
            initialProfileId={primaryProfileId}
            initialAlias={profileAlias}
            initialCountry={profileCountry}
            initialAvatarUrl={profileAvatarUrl}
          />
        </div>
      </section>

      <section id="premium-billing" className={premiumSectionClassName}>
        <h2 className="text-xl font-semibold text-white flex items-center gap-2">
          <ProBadge size="md" clickable={false} />
          {" "}membership
        </h2>
        <p className="mt-2 text-sm text-neutral-400">
          {subscriptionActive
            ? (
              <>
                Manage your <ProBadge size="xs" clickable={false} /> membership and billing settings below.
              </>
            )
            : (
              <>
                Become a <ProBadge size="xs" clickable={false} /> member to access advanced analytics and support the site. Start your free one-week trial.
              </>
            )}
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
        <dl className="mt-4 grid gap-3 text-sm text-neutral-300 sm:grid-cols-2">
          <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Status
            </dt>
            <dd className="mt-1 flex items-center gap-2 text-base font-semibold text-white">
              <span>{accountStatusLabel}</span>
              {subscriptionActive && <ProBadge size="sm" clickable={false} />}
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
        <div className="mt-4 flex flex-wrap items-start gap-3">
          {showGoPremium && !pendingActivation && (
          <GoPremiumButton
            profileId={primaryProfileId}
            premiumExpiresAt={effectivePremiumExpiry}
            isPremiumActive={subscriptionActive}
            returnToProfileId={returnToProfileId}
            autoTrigger={subscribeIntentActive && Boolean(primaryProfileId)}
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
        {isTrialing && effectivePremiumExpiry && (
          <div className={`mt-4 rounded-lg border p-4 text-sm ${cancelAtPeriodEnd ? 'border-neutral-600/40 bg-neutral-800/40 text-neutral-200' : 'border-amber-400/40 bg-amber-500/10 text-amber-200'}`}>
            <div className="flex items-start gap-3">
              <svg className={`h-5 w-5 shrink-0 ${cancelAtPeriodEnd ? 'text-neutral-400' : 'text-amber-400'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <div>
                <p className={`font-semibold ${cancelAtPeriodEnd ? 'text-neutral-100' : 'text-amber-100'}`}>
                  {cancelAtPeriodEnd ? 'Trial cancelled' : 'Free trial active'}
                </p>
                <p className="mt-1">
                  {cancelAtPeriodEnd ? (
                    <>Your trial will end on {formatDateTime(effectivePremiumExpiry)}. You won&apos;t be charged. You can reactivate anytime before then.</>
                  ) : (
                    <>Your trial ends on {formatDateTime(effectivePremiumExpiry)}. You&apos;ll be charged $4.99/month after that unless you cancel.</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {subscriptionActive && (
        <section className="rounded-2xl border border-neutral-700/60 bg-neutral-900/80 p-6 shadow-lg">
          <h2 className="text-xl font-semibold text-white">Pro badge visibility</h2>
          <p className="mt-2 text-sm text-neutral-400">
            Control whether your Pro badge is displayed next to your name across the site.
          </p>
          <ProBadgeToggle />
        </section>
      )}

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
