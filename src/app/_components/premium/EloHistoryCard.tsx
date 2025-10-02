"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdvancedStats } from "./AdvancedStatsPanel";

export type EloHistoryCardProps = {
  profileId: string | number;
  leaderboardId: number | "best" | "all" | null;
  windowDays: number;
};

type EloSample = {
  timestamp: string;
  leaderboardId: number;
  rating: number | null;
  rank: number | null;
  rankTotal: number | null;
};

type EloApiResponse = {
  activated: boolean;
  profileId: string;
  leaderboardId?: number;
  windowStart: string;
  generatedAt: string;
  samples: EloSample[];
  reason?: string;
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const formatRating = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return value.toString();
};

const coerceProfileId = (value: string | number): string => {
  return typeof value === "string" ? value : value.toString();
};

const buildQueryParams = (profileId: string, windowDays: number, leaderboardId: number | "best" | "all" | null) => {
  const params = new URLSearchParams();
  params.set("profileId", profileId);
  params.set("windowDays", String(windowDays));
  if (typeof leaderboardId === "number") {
    params.set("leaderboardId", String(leaderboardId));
  }
  return params.toString();
};

export default function EloHistoryCard({ profileId, leaderboardId, windowDays }: EloHistoryCardProps) {
  const { refresh: refreshActivation } = useAdvancedStats();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EloSample[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState<string | null>(null);

  const profileIdStr = useMemo(() => coerceProfileId(profileId), [profileId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = buildQueryParams(profileIdStr, windowDays, leaderboardId);
        const response = await fetch(`/api/premium/elo-history?${params}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as EloApiResponse;
          throw new Error(payload.reason || `HTTP ${response.status}`);
        }

        const payload = (await response.json()) as EloApiResponse;

        if (cancelled) return;
        setData(payload.samples || []);
        setGeneratedAt(payload.generatedAt || null);
        setWindowStart(payload.windowStart || null);
      } catch (error) {
        if (cancelled) return;
        if ((error as Error).name === "AbortError") return;
        console.error("[premium] elo history fetch failed", error);
        setError((error as Error).message || "Failed to load Elo history");
        setData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [profileIdStr, windowDays, leaderboardId, refreshActivation]);

  return (
    <section className="rounded-2xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-xl">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white">Elo ratings over time</h4>
          <p className="text-xs text-neutral-400">Track rating changes across snapshots.</p>
        </div>
        <div className="text-xs text-neutral-500">
          {windowStart && <span>Window start: {new Date(windowStart).toLocaleDateString()}</span>}
          {generatedAt && <span className="ml-2">Updated: {new Date(generatedAt).toLocaleString()}</span>}
        </div>
      </header>

      {loading && (
        <div className="mt-6 h-40 w-full animate-pulse rounded-xl bg-neutral-800/60" aria-hidden />
      )}

      {!loading && error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && data.length === 0 && (
        <div className="mt-6 rounded-lg border border-neutral-700/40 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          Not enough data yet. Play a few matches and check back soon.
        </div>
      )}

      {!loading && !error && data.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full table-fixed text-left text-sm text-neutral-200">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-neutral-400">
                <th className="w-1/5 pb-2">Date</th>
                <th className="w-1/5 pb-2">Leaderboard</th>
                <th className="w-1/5 pb-2">Rating</th>
                <th className="w-1/5 pb-2">Rank</th>
                <th className="w-1/5 pb-2">Population</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {data.map((sample) => (
                <tr key={`${sample.leaderboardId}-${sample.timestamp}`} className="hover:bg-neutral-800/30">
                  <td className="py-2 text-neutral-300">{formatDate(sample.timestamp)}</td>
                  <td className="py-2 text-neutral-300">{sample.leaderboardId}</td>
                  <td className="py-2 text-neutral-200 font-semibold">{formatRating(sample.rating)}</td>
                  <td className="py-2 text-neutral-300">{formatRating(sample.rank)}</td>
                  <td className="py-2 text-neutral-300">{formatRating(sample.rankTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

