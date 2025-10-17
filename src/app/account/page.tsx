import Link from "next/link";
import { redirect } from "next/navigation";
import { auth0 } from "@/lib/auth0";
import { getSupabaseAdmin } from "@/lib/premium/activation-server";
import { DeleteAccountButton } from "@/app/_components/DeleteAccountButton";
import { AccountProfileLinker } from "@/app/_components/AccountProfileLinker";
import { sanitizeEmail, upsertAppUser } from "@/lib/app-users";

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

export default async function AccountPage() {
  const session = await auth0.getSession();

  if (!session) {
    redirect(`/login?redirectTo=${encodeURIComponent("/account")}`);
  }

  const supabase = getSupabaseAdmin();

  let premiumExpiresAt: string | null = null;
  let stripeCustomerId: string | null = null;
  let stripeSubscriptionId: string | null = null;
  let primaryProfileId: number | null = null;
  let profileAlias: string | null = null;
  let profileCountry: string | null = null;

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
        "premium_expires_at, stripe_customer_id, stripe_subscription_id, primary_profile_id",
      )
      .eq("auth0_sub", session.user.sub)
      .maybeSingle();

    if (!error && data) {
      premiumExpiresAt = data.premium_expires_at ?? null;
      stripeCustomerId = data.stripe_customer_id ?? null;
      stripeSubscriptionId = data.stripe_subscription_id ?? null;
      primaryProfileId = data.primary_profile_id ?? null;

      if (primaryProfileId) {
        const { data: player, error: playerError } = await supabase
          .from("players")
          .select("profile_id, current_alias, country")
          .eq("profile_id", primaryProfileId)
          .maybeSingle();

        if (!playerError && player) {
          profileAlias = player.current_alias ?? null;
          profileCountry = player.country ?? null;
        }
      }
    }
  }

  const authProvider = session.user.sub?.split("|")[0] ?? "auth0";

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
        <dl className="mt-4 grid gap-3 text-sm text-neutral-300 md:grid-cols-2">
          <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Premium access expires
            </dt>
            <dd className="mt-1 text-base font-medium text-white">
              {formatDateTime(premiumExpiresAt)}
            </dd>
          </div>
          <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Stripe customer
            </dt>
            <dd className="mt-1 text-base font-medium text-white">
              {stripeCustomerId ?? "—"}
            </dd>
          </div>
          <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 p-4">
            <dt className="text-xs uppercase tracking-wide text-neutral-500">
              Stripe subscription
            </dt>
            <dd className="mt-1 text-base font-medium text-white">
              {stripeSubscriptionId ?? "—"}
            </dd>
          </div>
        </dl>
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
