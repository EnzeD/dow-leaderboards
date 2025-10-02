"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdvancedStats } from "./AdvancedStatsPanel";
import { raceIdToFaction } from "@/lib/race-utils";

export type MatchupMatrixCardProps = {
  profileId: string | number;
  windowDays: number;
  matchTypeId: number | null;
};

type MatchupRow = {
  myRaceId: number | null;
  opponentRaceId: number | null;
  matches: number;
  wins: number;
  losses: number;
  winrate: number | null;
  lastPlayed: string | null;
};

type MatchupsApiResponse = {
  activated: boolean;
  profileId: string;
  windowStart: string;
  generatedAt: string;
  matchTypeId?: number;
  rows: MatchupRow[];
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

const factions = [0, 1, 2, 3, 4, 5, 6, 7, 8];

export default function MatchupMatrixCard({ profileId, windowDays, matchTypeId }: MatchupMatrixCardProps) {
  const { refresh } = useAdvancedStats();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MatchupRow[]>([]);

  const profileIdStr = useMemo(() => coerceProfileId(profileId), [profileId]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/premium/matchups?${buildParams(profileIdStr, windowDays, matchTypeId)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as MatchupsApiResponse;
          throw new Error(payload.reason || `HTTP ${response.status}`);
        }

        const payload = (await response.json()) as MatchupsApiResponse;
        if (cancelled) return;
        setRows(payload.rows || []);
      } catch (error) {
        if (cancelled) return;
        if ((error as Error).name === "AbortError") return;
        console.error("[premium] matchup fetch failed", error);
        setError((error as Error).message || "Failed to load matchup data");
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

  const getCellData = (myRaceId: number | null, opponentRaceId: number | null) => {
    return rows.find((row) => row.myRaceId === myRaceId && row.opponentRaceId === opponentRaceId);
  };

  const computeCellClass = (winrate: number | null | undefined): string => {
    if (winrate === null || winrate === undefined || Number.isNaN(winrate)) return "bg-neutral-800/60";
    if (winrate >= 0.6) return "bg-green-600/40 text-green-100";
    if (winrate >= 0.5) return "bg-green-500/20 text-green-200";
    if (winrate <= 0.4) return "bg-red-600/40 text-red-100";
    if (winrate <= 0.5) return "bg-red-500/20 text-red-200";
    return "bg-neutral-700/60";
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return "—";
    return `${Math.round(value * 100)}%`;
  };

  return (
    <section className="rounded-2xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-xl">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white">Win rate per match-up</h4>
          <p className="text-xs text-neutral-400">Heatmap of faction performance against opponents.</p>
        </div>
      </header>

      {loading && (
        <div className="mt-6 h-60 w-full animate-pulse rounded-xl bg-neutral-800/60" aria-hidden />
      )}

      {!loading && error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="mt-6 rounded-lg border border-neutral-700/40 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          Not enough matches recorded to build matchup statistics yet.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full table-fixed border-separate border-spacing-1 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-neutral-900/90 px-3 py-2 text-left text-xs uppercase tracking-wide text-neutral-400 w-32">
                  You ↘ Opponent
                </th>
                {factions.map((raceId) => (
                  <th key={`opp-${raceId}`} className="px-2 py-2 text-center text-xs uppercase tracking-wide text-neutral-400 w-24">
                    {raceIdToFaction(raceId)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {factions.map((myRaceId) => (
                <tr key={`my-${myRaceId}`}>
                  <th className="sticky left-0 z-10 bg-neutral-900/90 px-3 py-2 text-left text-xs uppercase tracking-wide text-neutral-400 w-32">
                    {raceIdToFaction(myRaceId)}
                  </th>
                  {factions.map((opponentRaceId) => {
                    const cell = getCellData(myRaceId, opponentRaceId);
                    return (
                      <td
                        key={`cell-${myRaceId}-${opponentRaceId}`}
                        className={`w-24 rounded-md px-2 py-2 text-center text-xs font-semibold transition ${computeCellClass(cell?.winrate)}`}
                        title={cell
                          ? `${raceIdToFaction(myRaceId)} vs ${raceIdToFaction(opponentRaceId)}\nRecord: ${cell.wins}-${cell.losses} (${formatPercent(cell.winrate)})\nMatches: ${cell.matches}`
                          : `${raceIdToFaction(myRaceId)} vs ${raceIdToFaction(opponentRaceId)}\nNo data`}
                      >
                        {cell ? formatPercent(cell.winrate) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
