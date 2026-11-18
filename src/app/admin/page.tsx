import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { auth0, auth0Configured } from "@/lib/auth0";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Site analytics | Dawn of War Leaderboards",
  robots: { index: false, follow: false },
};

const featureLabels: Record<string, string> = {
  leaderboard_interaction: "Leaderboards",
  search_interaction: "Search",
  replay_interaction: "Replays",
  favorite_interaction: "Favorites",
  stats_interaction: "Stats",
  profile_viewed: "Player profiles",
  account_interaction: "Accounts",
};

type AnalyticsSummary = {
  pageViews: number;
  sessions: number;
  interactions: number;
  daily: { day: string; views: number }[];
  features: { name: string; interactions: number }[];
};

const countFormat = new Intl.NumberFormat("en");
const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

function DailyViews({ daily }: { daily: AnalyticsSummary["daily"] }) {
  const maxViews = Math.max(1, ...daily.map(({ views }) => views));

  return (
    <details open className="rounded-xl border border-neutral-800 bg-neutral-900/95 p-5">
      <summary className="cursor-pointer text-lg font-semibold">Daily page views (UTC)</summary>
      <ul className="mt-4 space-y-2 text-sm">
        {daily.map(({ day, views }) => (
          <li key={day} className="grid grid-cols-[4rem_1fr_4rem] items-center gap-3">
            <time dateTime={day} className="text-neutral-400">
              {dateFormat.format(new Date(day))}
            </time>
            <div aria-hidden="true" className="h-2 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${(views / maxViews) * 100}%` }} />
            </div>
            <span className="text-right tabular-nums">{countFormat.format(views)}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: { days?: string | string[] };
}) {
  const adminSub = process.env.ANALYTICS_ADMIN_AUTH0_SUB?.trim();
  if (!auth0Configured || !adminSub) notFound();

  const days = searchParams?.days === "7" ? 7 : 30;
  const session = await auth0.getSession();
  if (!session) {
    redirect(`/login?redirectTo=${encodeURIComponent(`/admin?days=${days}`)}`);
  }
  if (session.user.sub !== adminSub) notFound();

  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let summary: AnalyticsSummary | null = null;

  if (url && key) {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("product_analytics_summary", { period_days: days });

    if (error) {
      console.error("[analytics] summary query failed", error.code);
    } else {
      summary = data as AnalyticsSummary;
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-10 text-neutral-100 sm:px-8">
      <header className="mb-6">
        <Link href="/" className="text-sm text-neutral-400 underline-offset-4 hover:text-white hover:underline">
          Back to leaderboards
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-semibold">Site analytics</h1>
          <nav aria-label="Date range" className="flex gap-1 rounded-lg border border-neutral-700 bg-neutral-900 p-1">
            {([7, 30] as const).map((range) => (
              <Link
                key={range}
                href={`/admin?days=${range}`}
                aria-current={days === range ? "true" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm ${days === range ? "bg-neutral-700 text-white" : "text-neutral-300 hover:bg-neutral-800"}`}
              >
                {range} days
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {summary ? (
        <>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              { label: "Page views", count: summary.pageViews },
              { label: "Browser sessions", count: summary.sessions },
              { label: "Feature interactions", count: summary.interactions },
            ].map(({ label, count }) => (
              <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-900/95 p-5">
                <dt className="text-sm text-neutral-400">{label}</dt>
                <dd className="mt-2 text-3xl font-semibold tabular-nums">{countFormat.format(count)}</dd>
              </div>
            ))}
          </dl>

          <div className="mt-4 grid items-start gap-4 md:grid-cols-[3fr_2fr]">
            <DailyViews daily={summary.daily} />
            <section className="rounded-xl border border-neutral-800 bg-neutral-900/95 p-5">
              <h2 className="text-lg font-semibold">Interactions by feature</h2>
              {summary.features.length ? (
                <ul className="mt-3 divide-y divide-neutral-800">
                  {summary.features.map(({ name, interactions }) => (
                    <li key={name} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="text-neutral-300">{featureLabels[name] ?? name}</span>
                      <span className="tabular-nums">{countFormat.format(interactions)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-neutral-400">No feature interactions recorded in this period.</p>
              )}
            </section>
          </div>
        </>
      ) : (
        <p className="rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
          Analytics are temporarily unavailable.
        </p>
      )}
    </main>
  );
}
