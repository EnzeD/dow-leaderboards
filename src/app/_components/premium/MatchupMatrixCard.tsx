"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useAdvancedStats } from "./AdvancedStatsPanel";
import { raceIdToFaction } from "@/lib/race-utils";
import { getMapImage, getMapName } from "@/lib/mapMetadata";
import chaosIcon from "../../../../assets/factions/chaos.png";
import darkEldarIcon from "../../../../assets/factions/darkeldar.png";
import eldarIcon from "../../../../assets/factions/eldar.png";
import imperialGuardIcon from "../../../../assets/factions/imperialguard.png";
import necronIcon from "../../../../assets/factions/necron.png";
import orkIcon from "../../../../assets/factions/ork.png";
import sistersIcon from "../../../../assets/factions/sister.png";
import spaceMarineIcon from "../../../../assets/factions/spacemarine.png";
import tauIcon from "../../../../assets/factions/tau.png";
import Image, { type StaticImageData } from "next/image";

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

type MatchupMatchPlayer = {
  profileId?: string;
  alias?: string;
  teamId?: number;
  raceId?: number;
  oldRating?: number;
  newRating?: number;
};

type MatchupMatch = {
  matchId: number;
  mapName?: string;
  mapIdentifier?: string;
  matchTypeId?: number;
  startTime?: number;
  endTime?: number;
  durationSec?: number;
  outcome: "Win" | "Loss" | "Unknown";
  oldRating?: number;
  newRating?: number;
  ratingDiff?: number;
  teamId?: number;
  raceId?: number;
  opponentRaceId?: number;
  players: MatchupMatchPlayer[];
};

type MatchupMatchHistoryApiResponse = {
  activated: boolean;
  profileId: string;
  myRaceId: number | null;
  opponentRaceId: number | null;
  windowStart: string;
  generatedAt: string;
  matchTypeId?: number;
  rows: Array<{
    matchId: number;
    mapIdentifier: string | null;
    mapName: string | null;
    matchTypeId: number | null;
    startedAt: string | null;
    completedAt: string | null;
    durationSeconds: number | null;
    outcome: "win" | "loss" | "unknown";
    oldRating: number | null;
    newRating: number | null;
    ratingDelta: number | null;
    teamId: number | null;
    raceId: number | null;
    opponentRaceId: number | null;
    players: Array<{
      profileId: string | null;
      alias: string | null;
      teamId: number | null;
      raceId: number | null;
      oldRating: number | null;
      newRating: number | null;
    }> | null;
  }>;
  reason?: string;
};

type MatchHistoryState = {
  loading: boolean;
  error: string | null;
  matches: MatchupMatch[];
};

type RosterEntry = {
  key: string;
  label: string;
  faction: string;
  rating?: number;
  onClick?: () => void;
};

export type MatchupMatrixCardProps = {
  profileId: string | number;
  windowDays: number;
  matchTypeId: number | null;
  onPlayerNavigate?: (alias: string, profileId?: string) => void;
};

const factions = [0, 1, 2, 3, 4, 5, 6, 7, 8];

const MATCH_TYPE_LABELS: Record<number, string> = {
  1: "Automatch 1v1",
  2: "Automatch 2v2",
  3: "Automatch 3v3",
  4: "Automatch 4v4",
};

const FACTION_ICON_MAP: Record<string, StaticImageData | string> = {
  Chaos: chaosIcon,
  "Dark Eldar": darkEldarIcon,
  Eldar: eldarIcon,
  "Imperial Guard": imperialGuardIcon,
  Necrons: necronIcon,
  Orks: orkIcon,
  "Sisters of Battle": sistersIcon,
  "Space Marines": spaceMarineIcon,
  Tau: tauIcon,
};

const coerceProfileId = (value: string | number): string => {
  return typeof value === "string" ? value : value.toString();
};

type MatchScopeFilter = "all" | "automatch" | "custom";
type MatchFilterOption = "all" | "automatch1v1" | "automatch2v2" | "custom";

const MATCH_FILTERS: Array<{ label: string; value: MatchFilterOption }> = [
  { label: "All matches", value: "all" },
  { label: "1v1 Automatch", value: "automatch1v1" },
  { label: "2v2 Automatch", value: "automatch2v2" },
  { label: "Custom", value: "custom" },
];

const resolveFilter = (filter: MatchFilterOption): { matchTypeId: number | null; matchScope: MatchScopeFilter } => {
  switch (filter) {
    case "automatch1v1":
      return { matchTypeId: 1, matchScope: "automatch" };
    case "automatch2v2":
      return { matchTypeId: 2, matchScope: "automatch" };
    case "custom":
      return { matchTypeId: null, matchScope: "custom" };
    case "all":
    default:
      return { matchTypeId: null, matchScope: "all" };
  }
};

const buildParams = (profileId: string, windowDays: number, matchTypeId: number | null, matchScope: MatchScopeFilter) => {
  const params = new URLSearchParams();
  params.set("profileId", profileId);
  params.set("windowDays", String(windowDays));
  if (matchTypeId !== null && Number.isFinite(matchTypeId)) {
    params.set("matchTypeId", String(matchTypeId));
  }
  if (matchScope !== "all") {
    params.set("matchScope", matchScope);
  }
  return params.toString();
};

const buildMatchParams = (
  profileId: string,
  windowDays: number,
  matchTypeId: number | null,
  matchScope: MatchScopeFilter,
  myRaceId: number,
  opponentRaceId: number,
) => {
  const params = new URLSearchParams();
  params.set("profileId", profileId);
  params.set("windowDays", String(windowDays));
  params.set("myRaceId", String(myRaceId));
  params.set("opponentRaceId", String(opponentRaceId));
  if (matchTypeId !== null && Number.isFinite(matchTypeId)) {
    params.set("matchTypeId", String(matchTypeId));
  }
  if (matchScope !== "all") {
    params.set("matchScope", matchScope);
  }
  params.set("limit", "25");
  return params.toString();
};

const formatPercent = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value * 100)}%`;
};

const formatMatchTypeLabel = (matchTypeId?: number | null): string => {
  if (typeof matchTypeId !== "number") return "Custom";
  return MATCH_TYPE_LABELS[matchTypeId] ?? "Custom";
};

const formatLastMatch = (dateInput?: Date | string): string => {
  if (!dateInput) return "Never";
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays} days ago`;
  if (diffHours > 0) return `${diffHours} hours ago`;
  if (diffMinutes > 0) return `${diffMinutes} minutes ago`;
  return "Just now";
};

const getFactionColor = (faction: string): string => {
  const factionColors: Record<string, string> = {
    Chaos: "text-red-400",
    "Dark Eldar": "text-purple-400",
    Eldar: "text-blue-400",
    "Imperial Guard": "text-yellow-400",
    Necrons: "text-emerald-300",
    Orks: "text-green-400",
    "Sisters of Battle": "text-pink-400",
    "Space Marines": "text-blue-300",
    Tau: "text-cyan-400",
  };
  return factionColors[faction] || "text-orange-300";
};

const FactionLogo = ({ faction, size = 16, className = "", yOffset = 1 }: { faction?: string; size?: number; className?: string; yOffset?: number }) => {
  if (!faction) return null;
  const icon = FACTION_ICON_MAP[faction];
  if (!icon) return null;
  const url = typeof icon === "string" ? icon : (icon as any).src || "";
  const dim = `${size}px`;
  return (
    <span
      aria-hidden
      className={`inline-block align-middle ${className}`}
      style={{
        width: dim,
        height: dim,
        backgroundColor: "currentColor",
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        display: "inline-block",
        position: "relative",
        top: `${Math.max(1, Math.round(size * 0.06) - yOffset)}px`,
      }}
    />
  );
};

const normalizeIdentifier = (value?: string | null): string => {
  if (!value) return "unknown";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "unknown";
};

const normalizePlayerId = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const transformMatchRow = (row: MatchupMatchHistoryApiResponse["rows"][number]): MatchupMatch => {
  const startTime = row.startedAt ? new Date(row.startedAt).getTime() : undefined;
  const completedTime = row.completedAt ? new Date(row.completedAt).getTime() : undefined;
  const players: MatchupMatchPlayer[] = Array.isArray(row.players)
    ? row.players.map((player) => ({
        profileId: normalizePlayerId(player?.profileId),
        alias: player?.alias ?? undefined,
        teamId: typeof player?.teamId === "number" ? player.teamId : undefined,
        raceId: typeof player?.raceId === "number" ? player.raceId : undefined,
        oldRating: typeof player?.oldRating === "number" ? player.oldRating : undefined,
        newRating: typeof player?.newRating === "number" ? player.newRating : undefined,
      }))
    : [];

  const oldRating = typeof row.oldRating === "number" ? row.oldRating : undefined;
  const newRating = typeof row.newRating === "number" ? row.newRating : undefined;
  const ratingDelta = typeof row.ratingDelta === "number"
    ? row.ratingDelta
    : (typeof newRating === "number" && typeof oldRating === "number"
        ? newRating - oldRating
        : undefined);

  const mapIdentifier = normalizeIdentifier(row.mapIdentifier);
  return {
    matchId: row.matchId,
    mapIdentifier,
    mapName: row.mapName ?? undefined,
    matchTypeId: row.matchTypeId ?? undefined,
    startTime: typeof startTime === "number" && !Number.isNaN(startTime) ? Math.floor(startTime / 1000) : undefined,
    endTime: typeof completedTime === "number" && !Number.isNaN(completedTime) ? Math.floor(completedTime / 1000) : undefined,
    durationSec: typeof row.durationSeconds === "number" ? row.durationSeconds : undefined,
    outcome: row.outcome === "win" ? "Win" : row.outcome === "loss" ? "Loss" : "Unknown",
    oldRating,
    newRating,
    ratingDiff: ratingDelta,
    teamId: typeof row.teamId === "number" ? row.teamId : undefined,
    raceId: typeof row.raceId === "number" ? row.raceId : undefined,
    opponentRaceId: typeof row.opponentRaceId === "number" ? row.opponentRaceId : undefined,
    players,
  };
};

export default function MatchupMatrixCard({
  profileId,
  windowDays,
  matchTypeId,
  onPlayerNavigate,
}: MatchupMatrixCardProps) {
  const { refresh } = useAdvancedStats();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MatchupRow[]>([]);
  const [selectedPair, setSelectedPair] = useState<{ myRaceId: number; opponentRaceId: number } | null>(null);
  const [matchHistory, setMatchHistory] = useState<Record<string, MatchHistoryState>>({});
  const [selectedFilter, setSelectedFilter] = useState<MatchFilterOption>(matchTypeId === 1 ? "automatch1v1" : matchTypeId === 2 ? "automatch2v2" : "all");

  const profileIdStr = useMemo(() => coerceProfileId(profileId), [profileId]);

  useEffect(() => {
    setSelectedFilter(matchTypeId === 1 ? "automatch1v1" : matchTypeId === 2 ? "automatch2v2" : "all");
  }, [matchTypeId]);

  const { matchTypeId: filterMatchTypeId, matchScope } = useMemo(() => resolveFilter(selectedFilter), [selectedFilter]);

  const getPlayerClickHandler = useCallback((alias?: string | null, playerId?: string | null) => {
    if (!onPlayerNavigate) return undefined;
    const trimmedAlias = (alias ?? "").trim();
    if (!trimmedAlias) return undefined;
    return () => onPlayerNavigate(trimmedAlias, playerId ?? undefined);
  }, [onPlayerNavigate]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/premium/matchups?${buildParams(profileIdStr, windowDays, filterMatchTypeId, matchScope)}`, {
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
      } catch (fetchError) {
        if (cancelled) return;
        if ((fetchError as Error).name === "AbortError") return;
        console.error("[premium] matchup fetch failed", fetchError);
        setError((fetchError as Error).message || "Failed to load matchup data");
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
  }, [profileIdStr, windowDays, filterMatchTypeId, matchScope, refresh]);

  useEffect(() => {
    setSelectedPair(null);
    setMatchHistory({});
  }, [profileIdStr, windowDays, filterMatchTypeId, matchScope]);

  const getCellData = (myRaceId: number, opponentRaceId: number) => {
    return rows.find((row) => row.myRaceId === myRaceId && row.opponentRaceId === opponentRaceId);
  };

  const fetchMatchHistory = useCallback(async (myRaceId: number, opponentRaceId: number) => {
    if (!profileIdStr) return;
    const key = `${myRaceId}-${opponentRaceId}`;
    setMatchHistory((prev) => ({
      ...prev,
      [key]: {
        loading: true,
        error: null,
        matches: [],
      },
    }));

    try {
      const response = await fetch(`/api/premium/matchups/matches?${buildMatchParams(profileIdStr, windowDays, filterMatchTypeId, matchScope, myRaceId, opponentRaceId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as MatchupMatchHistoryApiResponse;
        throw new Error(payload.reason || `HTTP ${response.status}`);
      }

      const payload = (await response.json()) as MatchupMatchHistoryApiResponse;
      const matches = Array.isArray(payload.rows) ? payload.rows.map(transformMatchRow) : [];

      setMatchHistory((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: null,
          matches,
        },
      }));
    } catch (fetchError) {
      console.error("[premium] matchup match history fetch failed", fetchError);
      setMatchHistory((prev) => ({
        ...prev,
        [key]: {
          loading: false,
          error: (fetchError as Error).message || "Failed to load match history",
          matches: [],
        },
      }));
    }
  }, [profileIdStr, windowDays, filterMatchTypeId, matchScope]);

  const handleCellClick = (myRaceId: number, opponentRaceId: number, hasData: boolean) => {
    if (!hasData) return;
    const key = `${myRaceId}-${opponentRaceId}`;
    setSelectedPair((current) => {
      const next = current && current.myRaceId === myRaceId && current.opponentRaceId === opponentRaceId
        ? null
        : { myRaceId, opponentRaceId };
      if (next && !matchHistory[key]) {
        void fetchMatchHistory(myRaceId, opponentRaceId);
      }
      return next;
    });
  };

  const matchHistoryState = selectedPair
    ? matchHistory[`${selectedPair.myRaceId}-${selectedPair.opponentRaceId}`]
    : undefined;

  const renderRosterEntries = (entries: RosterEntry[], extraCount: number, align: "start" | "end" = "start") => (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-neutral-200 ${align === "end" ? "sm:justify-end" : ""}`}>
      {entries.map((entry, index) => (
        <Fragment key={entry.key || `${entry.label}-${index}`}>
          {index > 0 && <span className="text-neutral-500 select-none">•</span>}
          <button
            type="button"
            onClick={(event) => {
              if (!entry.onClick) return;
              event.stopPropagation();
              entry.onClick();
            }}
            className={`hover:underline ${entry.onClick ? "text-blue-300" : "text-neutral-400 cursor-default"}`}
            title={typeof entry.rating === "number" ? `${entry.label} (${entry.rating})` : entry.label}
            disabled={!entry.onClick}
          >
            {entry.label}
            {typeof entry.rating === "number" && (
              <span className="ml-1 text-neutral-400 whitespace-nowrap">{entry.rating}</span>
            )}
            {entry.faction !== "Unknown" && (
              <span className={`ml-1 ${getFactionColor(entry.faction)} inline-flex items-center`}>
                (
                <FactionLogo faction={entry.faction} size={11} yOffset={0} className="mx-1" />
                <span>{entry.faction}</span>
                )
              </span>
            )}
          </button>
        </Fragment>
      ))}
      {extraCount > 0 && (
        <Fragment>
          {entries.length > 0 && <span className="text-neutral-500 select-none">•</span>}
          <span className="text-neutral-400">+{extraCount}</span>
        </Fragment>
      )}
    </div>
  );

  const renderMatchCard = (match: MatchupMatch) => {
    const matchKey = match.matchId || `${match.startTime ?? "unknown"}-${match.outcome}`;
    const myPlayer = match.players.find((player) => player.profileId === profileIdStr);
    const myTeam = typeof match.teamId === "number" ? match.teamId : myPlayer?.teamId;
    const allies = (match.players || []).filter((player) => typeof player.teamId === "number" && player.teamId === myTeam && player.profileId !== profileIdStr);
    const opponents = (match.players || []).filter((player) => typeof player.teamId === "number" && player.teamId !== myTeam);

    const outcomeColor = match.outcome === "Win"
      ? "text-green-400"
      : match.outcome === "Loss"
        ? "text-red-400"
        : "text-neutral-300";

    const diffColor = (match.ratingDiff ?? 0) > 0 ? "text-green-400" : (match.ratingDiff ?? 0) < 0 ? "text-red-400" : "text-neutral-400";
    const matchType = formatMatchTypeLabel(match.matchTypeId);
    const isAutomatch = typeof match.matchTypeId === "number" && match.matchTypeId >= 1 && match.matchTypeId <= 4;
    const startDate = typeof match.startTime === "number" ? new Date(match.startTime * 1000) : undefined;
    const duration = typeof match.durationSec === "number" ? match.durationSec : undefined;
    const durationLabel = typeof duration === "number"
      ? `${Math.floor(duration / 60)}m${duration % 60 ? ` ${duration % 60}s` : ""}`
      : "";
    const myFaction = raceIdToFaction(match.raceId ?? myPlayer?.raceId);

    const mapDisplayName = match.mapName || getMapName(match.mapIdentifier) || "Unknown Map";
    const mapImagePath = getMapImage(match.mapIdentifier);
    const hasRoster = allies.length > 0 || opponents.length > 0;
    const displaySelfAlias = myPlayer?.alias || profileIdStr;
    const teamExtraCount = Math.max(0, allies.length - 2);
    const opponentExtraCount = Math.max(0, opponents.length - 3);
    const selfRating = typeof match.newRating === "number"
      ? match.newRating
      : (typeof match.oldRating === "number" ? match.oldRating : undefined);

    const teamEntries: RosterEntry[] = [
      {
        key: `self-${profileIdStr}-${match.matchId}`,
        label: displaySelfAlias,
        faction: myFaction,
        rating: isAutomatch ? selfRating : undefined,
        onClick: getPlayerClickHandler(displaySelfAlias, profileIdStr),
      },
      ...allies.slice(0, 2).map((player, index) => {
        const label = player.alias || player.profileId || `Ally ${index + 1}`;
        const faction = raceIdToFaction(player.raceId);
        const playerRating = typeof player.newRating === "number"
          ? player.newRating
          : (typeof player.oldRating === "number" ? player.oldRating : undefined);
        return {
          key: `ally-${player.profileId || index}-${match.matchId}`,
          label,
          faction,
          rating: isAutomatch ? playerRating : undefined,
          onClick: getPlayerClickHandler(player.alias, player.profileId),
        };
      }),
    ];

    const opponentEntries: RosterEntry[] = opponents.slice(0, 3).map((player, index) => {
      const label = player.alias || player.profileId || `Opponent ${index + 1}`;
      const faction = raceIdToFaction(player.raceId);
      const playerRating = typeof player.newRating === "number"
        ? player.newRating
        : (typeof player.oldRating === "number" ? player.oldRating : undefined);
      return {
        key: `opponent-${player.profileId || index}-${match.matchId}`,
        label,
        faction,
        rating: isAutomatch ? playerRating : undefined,
        onClick: getPlayerClickHandler(player.alias, player.profileId),
      };
    });

    return (
      <div key={matchKey} className="text-xs bg-neutral-900 border border-neutral-600/25 p-2 rounded shadow-md">
        <div className="flex items-stretch gap-3">
          <div className="relative h-14 w-14 flex-shrink-0 self-center sm:h-16 sm:w-16">
            <div className="absolute inset-0 rounded-lg bg-neutral-800/60 shadow-inner" aria-hidden />
            {mapImagePath ? (
              <Image
                src={mapImagePath}
                alt={`${mapDisplayName} mini-map`}
                className="relative h-full w-full rotate-45 transform-gpu rounded-lg border border-neutral-600/50 object-cover shadow-lg"
                draggable={false}
                fill
                sizes="(max-width: 640px) 56px, 64px"
              />
            ) : (
              <div className="relative flex h-full w-full rotate-45 transform-gpu items-center justify-center rounded-lg border border-dashed border-neutral-600/50 bg-neutral-800/40 text-[0.55rem] font-semibold uppercase tracking-wide text-neutral-500 shadow-lg">
                <span className="-rotate-45 select-none">No Map</span>
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 pl-0.5 sm:pl-1">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`${outcomeColor} font-semibold`}>{match.outcome || "Unknown"}</span>
                <span className="text-neutral-500">•</span>
                <span className="text-white truncate" title={mapDisplayName}>{mapDisplayName}</span>
                <span className="text-neutral-500">•</span>
                <span className="text-orange-300">{matchType}</span>
                {startDate && (
                  <>
                    <span className="text-neutral-500">•</span>
                    <span className="text-neutral-400">{formatLastMatch(startDate)}</span>
                  </>
                )}
                {durationLabel && (
                  <>
                    <span className="text-neutral-500">•</span>
                    <span className="text-neutral-400">{durationLabel}</span>
                  </>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {typeof match.oldRating === "number" && typeof match.newRating === "number" && (
                  <span className="text-neutral-300">{match.oldRating}→{match.newRating}</span>
                )}
                {typeof match.ratingDiff === "number" && (
                  <span className={`font-semibold ${diffColor}`}>
                    {match.ratingDiff > 0 ? `+${match.ratingDiff}` : match.ratingDiff}
                  </span>
                )}
              </div>
            </div>
            {hasRoster && (
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wide">Team</span>
                  {renderRosterEntries(teamEntries, teamExtraCount, "start")}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1 sm:items-end">
                  <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wide sm:text-right">Opponents</span>
                  <div className="w-full sm:w-auto">
                    {renderRosterEntries(opponentEntries, opponentExtraCount, "end")}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderMatchHistory = () => {
    if (!selectedPair) return null;
    const myFaction = raceIdToFaction(selectedPair.myRaceId);
    const opponentFaction = raceIdToFaction(selectedPair.opponentRaceId);
    const key = `${selectedPair.myRaceId}-${selectedPair.opponentRaceId}`;
    const state = matchHistory[key];

    if (!state || state.loading) {
      return (
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-20 animate-pulse rounded-lg bg-neutral-800/60" aria-hidden />
          ))}
        </div>
      );
    }

    if (state.error) {
      return (
        <div className="mt-3 rounded-lg border border-red-500/30 bg-red-900/20 p-3 text-xs text-red-300">
          {state.error}
        </div>
      );
    }

    if (state.matches.length === 0) {
      return (
        <div className="mt-3 rounded-lg border border-neutral-700/40 bg-neutral-900/60 p-3 text-xs text-neutral-300">
          No matches recorded for this match-up in the selected window.
        </div>
      );
    }

    return (
      <div className="mt-3 space-y-2">
        {state.matches.map((match) => renderMatchCard(match))}
      </div>
    );
  };

  return (
    <section className="rounded-2xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-xl">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-white">Win rate per match-up</h4>
          <p className="text-xs text-neutral-400">Heatmap of faction performance against opponents. Click a cell to view match history.</p>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {MATCH_FILTERS.map(({ label, value }) => {
          const active = selectedFilter === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setSelectedFilter(value)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "border-yellow-500/50 bg-yellow-500/20 text-yellow-200 shadow"
                  : "border-neutral-700/60 bg-neutral-900/60 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800/60 hover:text-white"
              }`}
              aria-pressed={active}
            >
              {label}
            </button>
          );
        })}
      </div>

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
        <>
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
                      const hasData = Boolean(cell && cell.matches > 0);
                      const isSelected = Boolean(selectedPair && selectedPair.myRaceId === myRaceId && selectedPair.opponentRaceId === opponentRaceId);
                      const winrate = cell?.winrate;
                      let cellClass = "bg-neutral-800/60";
                      if (typeof winrate === "number" && !Number.isNaN(winrate)) {
                        if (winrate >= 0.6) cellClass = "bg-green-600/40 text-green-100";
                        else if (winrate >= 0.5) cellClass = "bg-green-500/20 text-green-200";
                        else if (winrate <= 0.4) cellClass = "bg-red-600/40 text-red-100";
                        else if (winrate <= 0.5) cellClass = "bg-red-500/20 text-red-200";
                        else cellClass = "bg-neutral-700/60";
                      }
                      if (isSelected) {
                        cellClass += " ring-2 ring-yellow-300 ring-offset-1 ring-offset-neutral-900";
                      }
                      const displayValue = cell ? `${formatPercent(cell.winrate)} (${cell.matches})` : "—";
                      return (
                        <td key={`cell-${myRaceId}-${opponentRaceId}`} className="w-24 px-0 py-0">
                          <button
                            type="button"
                            onClick={() => handleCellClick(myRaceId, opponentRaceId, hasData)}
                            disabled={!hasData}
                            className={`group w-full rounded-md px-2 py-2 text-center text-xs font-semibold transition ${cellClass} ${hasData ? "cursor-pointer hover:opacity-95" : "cursor-not-allowed opacity-40"}`}
                            title={cell
                              ? `${raceIdToFaction(myRaceId)} vs ${raceIdToFaction(opponentRaceId)}\nRecord: ${cell.wins}-${cell.losses} (${formatPercent(cell.winrate)})\nMatches: ${cell.matches}`
                              : `${raceIdToFaction(myRaceId)} vs ${raceIdToFaction(opponentRaceId)}\nNo data`}
                          >
                            <span className="inline-flex items-center justify-center gap-1">
                              <span>{displayValue}</span>
                              {hasData && (
                                <span
                                  className={`inline-flex h-4 w-4 items-center justify-center rounded-full border transition ${
                                    isSelected
                                      ? "border-yellow-400 bg-yellow-400/20 text-yellow-200"
                                      : "border-neutral-600/60 bg-neutral-900/70 text-neutral-300 group-hover:border-neutral-400 group-hover:text-neutral-100"
                                  }`}
                                >
                                  <svg
                                    className={`h-2.5 w-2.5 transition ${isSelected ? "rotate-90" : ""}`}
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                </span>
                              )}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedPair && (
            <div className="mt-6 rounded-2xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-xl">
              <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${getFactionColor(raceIdToFaction(selectedPair.myRaceId))} inline-flex items-center gap-1`}>
                    <FactionLogo faction={raceIdToFaction(selectedPair.myRaceId)} size={16} />
                    {raceIdToFaction(selectedPair.myRaceId)}
                  </span>
                  <span className="text-neutral-500">vs</span>
                  <span className={`text-sm font-semibold ${getFactionColor(raceIdToFaction(selectedPair.opponentRaceId))} inline-flex items-center gap-1`}>
                    <FactionLogo faction={raceIdToFaction(selectedPair.opponentRaceId)} size={16} />
                    {raceIdToFaction(selectedPair.opponentRaceId)}
                  </span>
                </div>
              </header>
              {renderMatchHistory()}
            </div>
          )}
        </>
      )}
    </section>
  );
}
