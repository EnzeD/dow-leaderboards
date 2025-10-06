"use client";

import { useMemo } from "react";

export type ProfileOverview = {
  matches: number;
  matchesLast7Days: number;
  leaderboardWins: number;
  leaderboardLosses: number;
  leaderboardTotal: number;
  leaderboardWinrate: number | null;
  lastXpSync: string | null;
};

export type ProfileOverviewCardProps = {
  overview: ProfileOverview | null;
  loading: boolean;
  error: string | null;
};

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString();
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
};

const formatDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

export default function ProfileOverviewCard({ overview, loading, error }: ProfileOverviewCardProps) {
  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-lg bg-neutral-800/60" aria-hidden />
          ))}
        </div>
      );
    }

    if (error) {
      return (
        <div className="rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      );
    }

    if (!overview) {
      return (
        <div className="rounded-lg border border-neutral-700/40 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          No activity recorded yet.
        </div>
      );
    }

    return (
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-700/40 bg-neutral-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Matches in database</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatNumber(overview.matches)}</p>
          <p className="mt-1 text-xs text-neutral-400">+{formatNumber(overview.matchesLast7Days)} in the last 7 days</p>
        </div>
        <div className="rounded-lg border border-neutral-700/40 bg-neutral-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Leaderboard record</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatNumber(overview.leaderboardWins)}W / {formatNumber(overview.leaderboardLosses)}L</p>
          <p className="mt-1 text-xs text-neutral-400">
            Total {formatNumber(overview.leaderboardTotal)} · Win rate {formatPercent(overview.leaderboardWinrate)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-700/40 bg-neutral-900/70 p-4">
          <p className="text-xs uppercase tracking-wide text-neutral-400">Last crawl (XP)</p>
          <p className="mt-1 text-sm text-neutral-200">{formatDateTime(overview.lastXpSync)}</p>
          <p className="mt-1 text-[0.65rem] text-neutral-500">TODO: replace with premium crawl timestamp when job tracking is available.</p>
        </div>
      </div>
    );
  }, [loading, error, overview]);

  return (
    <section className="space-y-3">
      <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-neutral-400">General information</h4>
      {content}
    </section>
  );
}
