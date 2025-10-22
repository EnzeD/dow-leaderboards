"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { StatsCard } from "@/app/_components/stats/StatsCard";
import { getMapImage, getMapName } from "@/lib/mapMetadata";
import { formatCount, formatWinrate } from "@/lib/stats-formatters";
import {
  getFactionColor,
  getFactionIcon,
  getFactionName,
} from "@/lib/factions";

type MapOverviewRow = {
  mapIdentifier: string;
  mapName: string;
  matches: number;
  wins: number;
  losses: number;
  winrate: number | null;
  lastPlayed: string | null;
};

type MapsResponse = {
  windowDays: number;
  generatedAt: string;
  limit: number;
  rows: MapOverviewRow[];
  reason?: string;
};

type RaceBreakdownRow = {
  raceId: number;
  matches: number;
  wins: number;
  losses: number;
  winrate: number | null;
  lastPlayed: string | null;
};

type RaceBreakdownResponse = {
  mapIdentifier: string;
  windowDays: number;
  generatedAt: string;
  rows: RaceBreakdownRow[];
  reason?: string;
};

type RaceMatchupRow = {
  opponentRaceId: number;
  matches: number;
  wins: number;
  losses: number;
  winrate: number | null;
  lastPlayed: string | null;
};

type RaceMatchupResponse = {
  mapIdentifier: string;
  raceId: number;
  windowDays: number;
  generatedAt: string;
  rows: RaceMatchupRow[];
  reason?: string;
};

type LoadingState = {
  loading: boolean;
  error: string | null;
  data: MapsResponse | null;
};

type BreakdownState = {
  loading: boolean;
  error: string | null;
  rows: RaceBreakdownRow[];
};

type MatchupState = {
  loading: boolean;
  error: string | null;
  rows: RaceMatchupRow[];
};

const WINDOW_OPTIONS = [30, 90] as const;

const createInitialBreakdown = (): BreakdownState => ({
  loading: false,
  error: null,
  rows: [],
});

const createInitialMatchup = (): MatchupState => ({
  loading: false,
  error: null,
  rows: [],
});

const buildMapImage = (mapIdentifier: string) => {
  const mapImage = getMapImage(mapIdentifier);
  if (!mapImage) return null;
  return mapImage;
};

const sanitizeMapIdentifier = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]/g, "-");

const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg
    className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
    viewBox="0 0 20 20"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M5 8l5 5 5-5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const renderSkeletonGrid = () => (
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {Array.from({ length: 6 }).map((_, idx) => (
      <div
        // eslint-disable-next-line react/no-array-index-key
        key={idx}
        className="h-64 animate-pulse rounded-2xl border border-neutral-800/70 bg-neutral-900/60"
      />
    ))}
  </div>
);

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error;
  return fallback;
};

export default function StatsMapsPanel() {
  const [windowDays, setWindowDays] = useState<number>(90);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedMap, setExpandedMap] = useState<string | null>(null);
  const [mapsState, setMapsState] = useState<LoadingState>({
    loading: true,
    error: null,
    data: null,
  });
  const [breakdowns, setBreakdowns] = useState<Record<string, BreakdownState>>(
    {},
  );
  const [raceMatchups, setRaceMatchups] = useState<
    Record<string, Record<number, MatchupState>>
  >({});
  const [expandedRaceByMap, setExpandedRaceByMap] = useState<
    Record<string, number | null>
  >({});

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setMapsState(prev => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(`/api/stats/maps?windowDays=${windowDays}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          let reason = "Failed to load map statistics.";
          try {
            const payload = (await res.json()) as Partial<MapsResponse>;
            if (payload?.reason) {
              reason = `Request failed (${payload.reason}).`;
            }
          } catch {
            // ignore JSON parse errors
          }
          throw new Error(reason);
        }

        const payload = (await res.json()) as MapsResponse;
        setMapsState({
          loading: false,
          error: null,
          data: payload,
        });
        setBreakdowns({});
        setExpandedMap(null);
        setRaceMatchups({});
        setExpandedRaceByMap({});
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = extractErrorMessage(
          error,
          "Unable to load map statistics right now.",
        );
        setMapsState({
          loading: false,
          error: message,
          data: null,
        });
      }
    };

    load();

    return () => controller.abort();
  }, [windowDays, reloadKey]);

  const maps = useMemo(() => mapsState.data?.rows ?? [], [mapsState.data]);
  const effectiveWindow = mapsState.data?.windowDays ?? windowDays;

  const [columns, setColumns] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    if (window.innerWidth >= 1280) return 3;
    if (window.innerWidth >= 640) return 2;
    return 1;
  });

  useEffect(() => {
    const updateColumns = () => {
      if (window.innerWidth >= 1280) {
        setColumns(3);
      } else if (window.innerWidth >= 640) {
        setColumns(2);
      } else {
        setColumns(1);
      }
    };

    updateColumns();
    window.addEventListener("resize", updateColumns);
    return () => window.removeEventListener("resize", updateColumns);
  }, []);

  const rows = useMemo(() => {
    if (!maps.length) return [] as MapOverviewRow[][];
    const size = Math.max(1, columns);
    const chunks: MapOverviewRow[][] = [];
    for (let index = 0; index < maps.length; index += size) {
      chunks.push(maps.slice(index, index + size));
    }
    return chunks;
  }, [maps, columns]);
  const handleToggleMap = (mapIdentifier: string) => {
    setExpandedMap(prev => {
      const next = prev === mapIdentifier ? null : mapIdentifier;
      if (next && !breakdowns[next]) {
        void loadBreakdown(next);
      }
      return next;
    });
  };

  const loadBreakdown = async (mapIdentifier: string) => {
    setBreakdowns(prev => ({
      ...prev,
      [mapIdentifier]: {
        ...(prev[mapIdentifier] ?? createInitialBreakdown()),
        loading: true,
        error: null,
      },
    }));

    try {
      const res = await fetch(
        `/api/stats/maps/${encodeURIComponent(mapIdentifier)}?windowDays=${effectiveWindow}`,
      );
      if (!res.ok) {
        let reason = "Failed to load breakdown.";
        try {
          const payload = (await res.json()) as Partial<RaceBreakdownResponse>;
          if (payload?.reason) {
            reason = `Breakdown failed (${payload.reason}).`;
          }
        } catch {
          // ignore JSON parse errors
        }
        throw new Error(reason);
      }
      const payload = (await res.json()) as RaceBreakdownResponse;
      setBreakdowns(prev => ({
        ...prev,
        [mapIdentifier]: {
          loading: false,
          error: null,
          rows: payload.rows ?? [],
        },
      }));
    } catch (error) {
      const message = extractErrorMessage(
        error,
        "Unable to load race breakdown.",
      );
      setBreakdowns(prev => ({
        ...prev,
        [mapIdentifier]: {
          ...(prev[mapIdentifier] ?? createInitialBreakdown()),
          loading: false,
          error: message,
        },
      }));
    }
  };

  const loadRaceMatchups = async (mapIdentifier: string, raceId: number) => {
    setRaceMatchups(prev => ({
      ...prev,
      [mapIdentifier]: {
        ...(prev[mapIdentifier] ?? {}),
        [raceId]: {
          ...(prev[mapIdentifier]?.[raceId] ?? createInitialMatchup()),
          loading: true,
          error: null,
        },
      },
    }));

    try {
      const res = await fetch(
        `/api/stats/maps/${encodeURIComponent(mapIdentifier)}/race/${raceId}?windowDays=${effectiveWindow}`,
      );

      if (!res.ok) {
        let reason = "Failed to load matchup breakdown.";
        try {
          const payload = (await res.json()) as Partial<RaceMatchupResponse>;
          if (payload?.reason) {
            reason = `Breakdown failed (${payload.reason}).`;
          }
        } catch {
          // ignore
        }
        throw new Error(reason);
      }

      const payload = (await res.json()) as RaceMatchupResponse;
      setRaceMatchups(prev => ({
        ...prev,
        [mapIdentifier]: {
          ...(prev[mapIdentifier] ?? {}),
          [raceId]: {
            loading: false,
            error: null,
            rows: payload.rows ?? [],
          },
        },
      }));
    } catch (error) {
      const message = extractErrorMessage(
        error,
        "Unable to load matchup breakdown.",
      );
      setRaceMatchups(prev => ({
        ...prev,
        [mapIdentifier]: {
          ...(prev[mapIdentifier] ?? {}),
          [raceId]: {
            ...(prev[mapIdentifier]?.[raceId] ?? createInitialMatchup()),
            loading: false,
            error: message,
          },
        },
      }));
    }
  };

  const handleToggleRace = (mapIdentifier: string, raceId: number) => {
    setExpandedRaceByMap(prev => {
      const current = prev[mapIdentifier] ?? null;
      const next = current === raceId ? null : raceId;
      if (next !== null && !raceMatchups[mapIdentifier]?.[raceId]) {
        void loadRaceMatchups(mapIdentifier, raceId);
      }
      return {
        ...prev,
        [mapIdentifier]: next,
      };
    });
  };

  const renderBreakdown = (mapIdentifier: string) => {
    const state = breakdowns[mapIdentifier];
    if (!state) {
      return <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/60 p-4 text-sm text-neutral-400">Loading breakdown…</div>;
    }

    if (state.loading) {
      return <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/60 p-4 text-sm text-neutral-400">Loading breakdown…</div>;
    }

    if (state.error) {
      return (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          <div className="flex items-center justify-between gap-4">
            <span>{state.error}</span>
            <button
              type="button"
              onClick={() => loadBreakdown(mapIdentifier)}
              className="rounded-md border border-rose-400/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-100 hover:border-rose-300 hover:text-white"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }

    if (!state.rows.length) {
      return (
        <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/60 p-4 text-sm text-neutral-400">
          No faction breakdown available for this map.
        </div>
      );
    }

    const expandedRaceId = expandedRaceByMap[mapIdentifier] ?? null;
    const matchupsForMap = raceMatchups[mapIdentifier] ?? {};

    return (
      <div className="space-y-3 rounded-xl border border-neutral-800/60 bg-neutral-900/60 p-4">
        {state.rows.map(row => {
          const factionName = getFactionName(row.raceId);
          const factionIcon = getFactionIcon(row.raceId);
        const accentBorder = getFactionColor(row.raceId, "border");
        const accentBackground = getFactionColor(row.raceId, "softBg");
        const textColor = getFactionColor(row.raceId, "text");
        const isExpanded = expandedRaceId === row.raceId;
        const matchupState = matchupsForMap[row.raceId];
        const containerBorder = isExpanded ? accentBorder : "border-neutral-800/60 hover:border-neutral-600";
        const containerBackground = isExpanded ? accentBackground : "bg-neutral-900/70 hover:bg-neutral-900/80";
        const indicatorLabel = isExpanded ? "Hide matchups" : "View matchups";

        return (
          <div
            key={`${mapIdentifier}-${row.raceId}`}
            className={`rounded-lg border transition-colors ${containerBorder} ${containerBackground}`}
          >
            <button
              type="button"
              onClick={() => handleToggleRace(mapIdentifier, row.raceId)}
              aria-expanded={isExpanded}
              className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3 text-left"
            >
                <div className="flex min-w-[200px] flex-1 items-center gap-3">
                  {factionIcon ? (
                    <Image
                      src={factionIcon}
                      alt=""
                      className="h-10 w-10 rounded-full border border-neutral-700/80 bg-neutral-800/80 p-1"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-neutral-700/80 bg-neutral-800/80 text-sm font-semibold text-neutral-300">
                      {factionName.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                  <div>
                  <p className={`text-sm font-semibold ${textColor}`}>
                    {factionName}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {formatCount(row.matches)} matches · {formatWinrate(row.winrate)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-sm text-neutral-300">
                <span>
                  Wins <span className="font-semibold text-white">{formatCount(row.wins)}</span>
                </span>
                <span>
                  Losses <span className="font-semibold text-white">{formatCount(row.losses)}</span>
                </span>
                <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                  {indicatorLabel}
                  <ChevronIcon open={isExpanded} />
                </span>
              </div>
            </button>

            {isExpanded ? (
              <div className="border-t border-neutral-800/60 px-4 pb-4 pt-3">
                  {matchupState?.loading ? (
                    <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/70 p-3 text-sm text-neutral-300">
                      Loading opponent breakdown…
                    </div>
                  ) : matchupState?.error ? (
                    <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                      <div className="flex items-center justify-between gap-3">
                        <span>{matchupState.error}</span>
                        <button
                          type="button"
                          onClick={() => loadRaceMatchups(mapIdentifier, row.raceId)}
                          className="rounded-md border border-rose-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-50 hover:border-rose-200 hover:text-white"
                        >
                          Retry
                        </button>
                      </div>
                    </div>
                  ) : !matchupState || matchupState.rows.length === 0 ? (
                    <div className="rounded-lg border border-neutral-800/60 bg-neutral-900/70 p-3 text-sm text-neutral-300">
                      No opponent breakdown available for this matchup.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {matchupState.rows.map(matchup => {
                        const opponentName = getFactionName(matchup.opponentRaceId);
                        const opponentIcon = getFactionIcon(matchup.opponentRaceId);
                        const opponentAccent = getFactionColor(matchup.opponentRaceId, "softBg");
                        const opponentBorder = getFactionColor(matchup.opponentRaceId, "border");
                        return (
                          <div
                            key={`${mapIdentifier}-${row.raceId}-${matchup.opponentRaceId}`}
                            className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2 ${opponentBorder} ${opponentAccent}`}
                          >
                            <div className="flex items-center gap-3 text-sm text-neutral-200">
                              {opponentIcon ? (
                                <Image
                                  src={opponentIcon}
                                  alt=""
                                  className="h-6 w-6 rounded-full border border-neutral-700/70 bg-neutral-800/70 p-0.5"
                                />
                              ) : (
                                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-700/70 bg-neutral-800/70 text-[10px] font-semibold text-neutral-300">
                                  {opponentName.slice(0, 2).toUpperCase()}
                                </span>
                              )}
                              <span>{opponentName}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-300">
                              <span>{formatCount(matchup.matches)} matches</span>
                              <span>
                                Wins <span className="font-semibold text-white">{formatCount(matchup.wins)}</span>
                              </span>
                              <span>
                                Losses <span className="font-semibold text-white">{formatCount(matchup.losses)}</span>
                              </span>
                              <span>{formatWinrate(matchup.winrate)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <StatsCard
      title="Maps overview"
      description={`Top ranked 1v1 maps over the last ${effectiveWindow} days.`}
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
      {mapsState.loading && !maps.length ? (
        renderSkeletonGrid()
      ) : mapsState.error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{mapsState.error}</span>
            <button
              type="button"
              onClick={() => setReloadKey(key => key + 1)}
              className="rounded-md border border-rose-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-50 hover:border-rose-200 hover:text-white"
            >
              Retry
            </button>
          </div>
        </div>
      ) : !maps.length ? (
        <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/60 p-5 text-sm text-neutral-300">
          No ranked matches recorded in this window. Try a wider range.
        </div>
      ) : (
        <div className="space-y-6">
          {rows.map((row, rowIndex) => {
            const rowClass =
              columns >= 3
                ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
                : columns === 2
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1";

            const expandedDetails = row.find(
              item => (item.mapIdentifier || "unknown") === expandedMap,
            );
            const expandedIdentifier = expandedDetails
              ? expandedDetails.mapIdentifier || "unknown"
              : null;
            const expandedSanitized = expandedIdentifier
              ? sanitizeMapIdentifier(expandedIdentifier)
              : null;
            const expandedImage = expandedIdentifier
              ? buildMapImage(expandedIdentifier)
              : null;
            const expandedName = expandedIdentifier
              ? getMapName(expandedIdentifier) ??
                expandedDetails?.mapName ??
                expandedIdentifier
              : null;

            return (
              <Fragment key={`row-${rowIndex}`}>
                <div className={`grid gap-4 ${rowClass}`}>
                  {row.map(map => {
                    const mapIdentifier = map.mapIdentifier || "unknown";
                    const normalizedName =
                      getMapName(mapIdentifier) ?? map.mapName ?? mapIdentifier;
                    const mapImage = buildMapImage(mapIdentifier);
                    const isExpanded = expandedMap === mapIdentifier;
                    const sanitizedId = sanitizeMapIdentifier(mapIdentifier);
                    const breakdownId = `map-breakdown-${sanitizedId}`;

                    return (
                      <div
                        key={mapIdentifier}
                        className={`flex flex-col rounded-2xl border p-4 transition-colors hover:border-neutral-700/70 ${
                          isExpanded
                            ? "border-neutral-600 bg-neutral-900/60"
                            : "border-neutral-800/70 bg-neutral-950/40"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleMap(mapIdentifier)}
                          aria-expanded={isExpanded}
                          aria-controls={breakdownId}
                          className="w-full text-left"
                        >
                          <div className="flex flex-col gap-4">
                            <div className="relative h-36 w-full overflow-hidden rounded-xl border border-neutral-800/70 bg-neutral-900/40">
                              {mapImage ? (
                                <Image
                                  src={mapImage}
                                  alt=""
                                  fill
                                  sizes="(min-width: 1280px) 320px, (min-width: 768px) 45vw, 90vw"
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs uppercase tracking-wide text-neutral-400">
                                  No preview
                                </div>
                              )}
                              <div className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-black/70 px-3 py-1 text-xs font-semibold text-white">
                                {formatCount(map.matches)} games
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between">
                            <p className="text-sm font-semibold text-white">
                              {normalizedName}
                            </p>
                            <ChevronIcon open={isExpanded} />
                          </div>
                        </button>
                      </div>
                    );
                  })}
                </div>
                {expandedDetails && expandedIdentifier && expandedSanitized ? (
                  <div
                    id={`map-breakdown-${expandedSanitized}`}
                    className="mt-4 flex flex-col gap-3 rounded-2xl border border-neutral-800/70 bg-neutral-950/60 p-6"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="relative h-16 w-28 overflow-hidden rounded-xl border border-neutral-800/70 bg-neutral-900/40">
                          {expandedImage ? (
                            <Image
                              src={expandedImage}
                              alt=""
                              fill
                              sizes="128px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs uppercase tracking-wide text-neutral-400">
                              No preview
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="text-lg font-semibold text-white">
                            {expandedName}
                          </p>
                          <p className="text-sm text-neutral-400">
                            {formatCount(expandedDetails.matches)} total games
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setExpandedMap(null)}
                        className="rounded-full border border-neutral-700/70 px-4 py-2 text-sm font-semibold text-neutral-200 transition hover:border-neutral-500 hover:text-white"
                      >
                        Collapse
                      </button>
                    </div>
                    {renderBreakdown(expandedIdentifier)}
                  </div>
                ) : null}
              </Fragment>
            );
          })}
        </div>
      )}
    </StatsCard>
  );
}
