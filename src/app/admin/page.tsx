import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { auth0, auth0Configured } from "@/lib/auth0";
import AnalyticsDashboard, { type AnalyticsOverview } from "./analytics-dashboard";
import { OnlineNow } from "./online-now";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Site analytics | Dawn of War Leaderboards",
  robots: { index: false, follow: false },
};

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
  let overview: AnalyticsOverview | null = null;

  if (url && key) {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.rpc("site_analytics_overview", { period_days: days });

    if (error) {
      console.error("[analytics] overview query failed", error.code);
    } else {
      overview = data as AnalyticsOverview;
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-neutral-100 sm:px-8 sm:py-10">
      <header className="mb-6">
        <Link href="/" className="text-sm text-neutral-400 underline-offset-4 hover:text-white hover:underline">
          Back to leaderboards
        </Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-3xl font-semibold text-white">Site analytics</h1>
          <div className="flex flex-wrap items-center gap-3">
            <OnlineNow />
            <nav aria-label="Date range" className="flex gap-1 rounded-full border border-white/10 bg-neutral-900 p-1">
              {([7, 30] as const).map((range) => (
                <Link
                  key={range}
                  href={`/admin?days=${range}`}
                  aria-current={days === range ? "true" : undefined}
                  className={`rounded-full px-4 py-1.5 text-sm ${days === range ? "bg-amber-400/15 text-amber-200" : "text-neutral-300 hover:bg-white/5"}`}
                >
                  {range} days
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {overview ? (
        <AnalyticsDashboard data={overview} />
      ) : (
        <p className="rounded-xl border border-neutral-700 bg-neutral-900 p-5 text-neutral-300">
          Analytics are temporarily unavailable.
        </p>
      )}
    </main>
  );
}
