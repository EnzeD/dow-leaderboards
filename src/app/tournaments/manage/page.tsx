import Link from "next/link";
import { redirect } from "next/navigation";
import { TournamentManager } from "@/app/_components/tournaments/TournamentManager";
import { getTournamentManagerContext } from "@/lib/tournaments/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default async function TournamentManagementPage({ searchParams }: PageProps) {
  const previewParam = searchParams?.preview;
  const previewRequested = Array.isArray(previewParam)
    ? previewParam.includes("1")
    : previewParam === "1";

  if (process.env.NODE_ENV !== "production" && previewRequested) {
    return <TournamentManager previewMode />;
  }

  const context = await getTournamentManagerContext();

  if (!context.ok && context.status === 401) {
    redirect(`/login?redirectTo=${encodeURIComponent("/tournaments/manage")}`);
  }

  if (!context.ok) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12 text-neutral-100">
        <section className="w-full rounded-2xl border border-neutral-700/60 bg-neutral-900/85 p-8 shadow-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-neutral-500">
            Tournament management
          </p>
          <h1 className="mt-3 text-3xl font-semibold text-white">
            {context.status === 403 ? "Access denied" : "Management unavailable"}
          </h1>
          <p className="mt-3 text-neutral-400">
            {context.status === 403
              ? "Your account does not have permission to manage tournament promotions."
              : "The secure database connection is unavailable. Please try again later."}
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded-lg border border-neutral-700/60 bg-neutral-800/70 px-4 py-2 text-sm font-semibold text-neutral-100 transition hover:bg-neutral-700/70"
          >
            Back to leaderboards
          </Link>
        </section>
      </main>
    );
  }

  return <TournamentManager />;
}
