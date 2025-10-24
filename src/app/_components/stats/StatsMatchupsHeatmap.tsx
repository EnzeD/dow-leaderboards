"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { StatsCard } from "@/app/_components/stats/StatsCard";
import {
  allFactions,
  getFactionIcon,
  getFactionName,
  getFactionShortName,
} from "@/lib/factions";
import {
  formatCount,
  formatWinrate,
  winrateToHeatmapColor,
  winrateToTextColor,
} from "@/lib/stats-formatters";

type MatchupRow = {
  myRaceId: number;
  opponentRaceId: number;
  matches: number;
  wins: number;
  losses: number;
  winrate: number | null;
  lastPlayed: string | null;
};

type MatchupResponse = {
  windowDays: number;
  generatedAt: string;
  rows: MatchupRow[];
  reason?: string;
};

type LoadingState = {
  loading: boolean;
  error: string | null;
  data: MatchupResponse | null;
};

const WINDOW_OPTIONS = [30, 90] as const;

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error;
  return fallback;
};

const keyFor = (myRaceId: number, opponentRaceId: number) =>
  `${myRaceId}-${opponentRaceId}`;

export default function StatsMatchupsHeatmap() {
  const factions = useMemo(() => allFactions(), []);
  const [windowDays, setWindowDays] = useState<number>(90);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadingState>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(`/api/stats/matchups?windowDays=${windowDays}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          let reason = "Failed to load matchup matrix.";
          try {
            const payload = (await res.json()) as Partial<MatchupResponse>;
            if (payload?.reason) {
              reason = `Request failed (${payload.reason}).`;
            }
          } catch {
            // ignore
          }
          throw new Error(reason);
        }

        const payload = (await res.json()) as MatchupResponse;
        setState({
          loading: false,
          error: null,
          data: payload,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = extractErrorMessage(
          error,
          "Unable to load matchup matrix right now.",
        );
        setState({
          loading: false,
          error: message,
          data: null,
        });
      }
    };

    load();

    return () => controller.abort();
  }, [windowDays, reloadKey]);

  const matrix = useMemo(() => {
    const map = new Map<string, MatchupRow>();
    for (const row of state.data?.rows ?? []) {
      map.set(keyFor(row.myRaceId, row.opponentRaceId), row);
    }

    return factions.map(my => {
      return factions.map(opponent => {
        const key = keyFor(my.raceId, opponent.raceId);
        const row = map.get(key);
        if (!row) {
          return {
            myRaceId: my.raceId,
            opponentRaceId: opponent.raceId,
            matches: 0,
            wins: 0,
            losses: 0,
            winrate: null,
            lastPlayed: null,
          };
        }
        return row;
      });
    });
  }, [state.data, factions]);

  const effectiveWindow = state.data?.windowDays ?? windowDays;

  return (
    <StatsCard
      title="Matchup heatmap"
      description={`Row faction performance versus column faction across ranked 1v1 matches in the last ${effectiveWindow} days.`}
      actions={
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Range</span>
          <select
            value={windowDays}
            onChange={event => setWindowDays(Number(event.target.value))}
            className="rounded-md border border-neutral-700/80 bg-neutral-900/80 px-2 py-1 text-sm text-white focus:border-neutral-400 focus:outline-none"
          >
            {WINDOW_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option} days
              </option>
            ))}
          </select>
        </label>
      }
    >
      {state.loading && !state.data ? (
        <div className="h-[420px] animate-pulse rounded-xl border border-neutral-800/70 bg-neutral-900/50" />
      ) : state.error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{state.error}</span>
            <button
              type="button"
              onClick={() => setReloadKey(key => key + 1)}
              className="rounded-md border border-rose-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-50 hover:border-rose-200 hover:text-white"
            >
              Retry
            </button>
          </div>
        </div>
      ) : !state.data?.rows?.length ? (
        <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/60 p-5 text-sm text-neutral-300">
          Not enough ranked matches in this window to build a matchup matrix. Try expanding the range.
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/40 px-4 py-3 text-sm text-neutral-300">
            <span className="font-medium text-neutral-200">How to read:</span> Each cell shows the row faction's win rate against the column faction. For example, if Dark Eldar (row) vs Sisters (column) shows 44.0%, this means Dark Eldar wins 44% of matches against Sisters.
          </div>
          <div className="overflow-auto">
            <table className="min-w-max border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-neutral-950/95 px-3 py-2 text-left text-xs uppercase tracking-wide text-neutral-400">
                    Row % win vs. Column
                  </th>
                  {factions.map(faction => (
                    <th
                      key={`col-${faction.raceId}`}
                      className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-neutral-300"
                      title={faction.name}
                    >
                      <div className="flex flex-col items-center gap-1">
                        {getFactionIcon(faction.raceId) ? (
                          <Image
                            src={getFactionIcon(faction.raceId)!}
                            alt=""
                            className="h-8 w-8 rounded-full border border-neutral-700/70 bg-neutral-900/80 p-1"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700/70 bg-neutral-900/80 text-[0.6rem] text-neutral-300">
                            {faction.shortName}
                          </span>
                        )}
                        <span>{faction.shortName}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {factions.map((rowFaction, rowIdx) => (
                  <tr key={`row-${rowFaction.raceId}`} className="border-t border-neutral-800/60">
                    <th className="sticky left-0 z-10 bg-neutral-950/95 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-neutral-300">
                      <div className="flex items-center gap-2">
                        {getFactionIcon(rowFaction.raceId) ? (
                          <Image
                            src={getFactionIcon(rowFaction.raceId)!}
                            alt=""
                            className="h-8 w-8 rounded-full border border-neutral-700/70 bg-neutral-900/80 p-1"
                          />
                        ) : (
                          <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700/70 bg-neutral-900/80 text-[0.6rem] text-neutral-300">
                            {rowFaction.shortName}
                          </span>
                        )}
                        <span>{rowFaction.name}</span>
                      </div>
                    </th>
                    {factions.map((colFaction, colIdx) => {
                      const cell = matrix[rowIdx][colIdx];
                      const winrateDisplay = formatWinrate(cell.winrate);
                      const matchesDisplay = formatCount(cell.matches);
                      const textColour = winrateToTextColor(cell.winrate);
                      const background = winrateToHeatmapColor(cell.winrate);
                      const tooltip = `${getFactionName(cell.myRaceId)} vs ${getFactionName(cell.opponentRaceId)} · ${matchesDisplay} matches · ${winrateDisplay} winrate`;

                      return (
                        <td key={`cell-${rowFaction.raceId}-${colFaction.raceId}`} className="px-2 py-2 text-center align-middle">
                          <div
                            className="flex h-20 w-24 flex-col items-center justify-center rounded-lg border border-neutral-800/60 px-1 text-xs"
                            style={{ background }}
                            title={tooltip}
                          >
                            <span className={`text-sm font-semibold ${textColour}`}>
                              {winrateDisplay}
                            </span>
                            <span className="text-neutral-200">{matchesDisplay}</span>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-400">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-3 w-10 rounded-full" style={{ background: "linear-gradient(to right, rgba(239,68,68,0.6), rgba(239,68,68,0.15))" }} />
              <span>Below 50% winrate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-3 w-10 rounded-full" style={{ background: "linear-gradient(to right, rgba(34,197,94,0.15), rgba(34,197,94,0.6))" }} />
              <span>Above 50% winrate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-3 w-3 rounded-full bg-neutral-600/60" />
              <span>Grey cells indicate limited sample size or a 50% rate.</span>
            </div>
          </div>
        </div>
      )}
    </StatsCard>
  );
}
