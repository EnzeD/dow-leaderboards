"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdvancedStats } from "./AdvancedStatsPanel";

export type FrequentOpponentsCardProps = {
  profileId: string | number;
  windowDays: number;
  matchTypeId: number | null;
};

type OpponentRow = {
  opponentProfileId: string | null;
  opponentAlias: string;
  matches: number;
  wins: number;
  losses: number;
  winrate: number | null;
  lastPlayed: string | null;
};

type OpponentsApiResponse = {
  activated: boolean;
  profileId: string;
  windowStart: string;
  generatedAt: string;
  matchTypeId?: number;
  rows: OpponentRow[];
  reason?: string;
};

const coerceProfileId = (value: string | number): string => {
  return typeof value === "string" ? value : value.toString();
};

const buildParams = (profileId: string, windowDays: number, matchTypeId: number | null) => {
  const params = new URLSearchParams();
  params.set("profileId", profileId);
  params.set("windowDays", String(windowDays));
  if (matchTypeId !== null && Number.isFinite(matchTypeId)) {
    params.set("matchTypeId", String(matchTypeId));
  }
  return params.toString();
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
};

export default function FrequentOpponentsCard({ profileId, windowDays, matchTypeId }: FrequentOpponentsCardProps) {
  const { refresh } = useAdvancedStats();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OpponentRow[]>([]);

  const profileIdStr = useMemo(() => coerceProfileId(profileId), [profileId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/premium/opponents?${buildParams(profileIdStr, windowDays, matchTypeId)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as OpponentsApiResponse;
          throw new Error(payload.reason || `HTTP ${response.status}`);
        }

        const payload = (await response.json()) as OpponentsApiResponse;
        if (cancelled) return;
        setRows(payload.rows || []);
      } catch (error) {
        if (cancelled) return;
        if ((error as Error).name === "AbortError") return;
        console.error("[premium] opponent stats fetch failed", error);
        setError((error as Error).message || "Failed to load opponent statistics");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [profileIdStr, windowDays, matchTypeId, refresh]);

  return (
    <section className="rounded-2xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-xl">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white">Frequent opponents</h4>
          <p className="text-xs text-neutral-400">Your most common opponents and head-to-head record.</p>
        </div>
      </header>

      {loading && (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-12 animate-pulse rounded-lg bg-neutral-800/60" aria-hidden />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="mt-6 rounded-lg border border-neutral-700/40 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          No frequent opponents yet. Play more ranked matches to populate this list.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full text-left text-sm text-neutral-200">
            <thead className="text-xs uppercase tracking-wide text-neutral-400">
              <tr>
                <th className="py-2">Opponent</th>
                <th className="py-2">Matches</th>
                <th className="py-2">Record</th>
                <th className="py-2">Win rate</th>
                <th className="py-2">Last played</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {rows.map((row) => (
                <tr key={`${row.opponentProfileId ?? row.opponentAlias}`} className="hover:bg-neutral-800/30">
                  <td className="py-3">
                    <div className="flex flex-col">
                      <span className="font-semibold text-neutral-100">{row.opponentAlias}</span>
                      {row.opponentProfileId && (
                        <span className="text-xs text-neutral-500">Profile ID: {row.opponentProfileId}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3">{row.matches}</td>
                  <td className="py-3 text-neutral-300">{row.wins}-{row.losses}</td>
                  <td className="py-3">{formatPercent(row.winrate)}</td>
                  <td className="py-3 text-neutral-400">{row.lastPlayed ? new Date(row.lastPlayed).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

