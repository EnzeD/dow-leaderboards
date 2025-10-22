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

export type MatchScope = "automatch" | "custom" | "all";

export type FrequentOpponentsCardProps = {
  profileId: string | number;
  windowDays: number;
  matchScope: MatchScope;
  onMatchScopeChange: (scope: MatchScope) => void;
  onPlayerNavigate?: (alias: string, profileId?: string) => void;
};

type OpponentRow = {
  opponentProfileId: string | null;
  opponentAlias: string;
  opponentCountry: string | null;
  opponentMainRaceId: number | null;
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
  matchScope?: MatchScope;
  rows: OpponentRow[];
  reason?: string;
};

type OpponentMatchPlayer = {
  profileId?: string;
  alias?: string;
  teamId?: number;
  raceId?: number;
  oldRating?: number;
  newRating?: number;
};

type OpponentMatch = {
  matchId: number;
  mapIdentifier?: string;
  mapName?: string;
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
  players: OpponentMatchPlayer[];
};

type OpponentMatchHistoryApiResponse = {
  activated: boolean;
  profileId: string;
  opponentProfileId: string;
  windowStart: string;
  generatedAt: string;
  matchTypeId?: number;
  matchScope?: MatchScope;
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
  matches: OpponentMatch[];
};

type RosterEntry = {
  key: string;
  label: string;
  faction: string;
  rating?: number;
  onClick?: () => void;
};

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

const buildParams = (profileId: string, windowDays: number, matchScope: MatchScope) => {
  const params = new URLSearchParams();
  params.set("profileId", profileId);
  params.set("windowDays", String(windowDays));
  if (matchScope !== "all") {
    params.set("matchScope", matchScope);
  }
  return params.toString();
};

const buildMatchParams = (
  profileId: string,
  windowDays: number,
  matchScope: MatchScope,
  opponentProfileId: string,
) => {
  const params = new URLSearchParams();
  params.set("profileId", profileId);
  params.set("windowDays", String(windowDays));
  params.set("opponentProfileId", opponentProfileId);
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

const getTierIndicator = (rank: number): string => {
  if (rank <= 5) return "🏆";
  if (rank <= 10) return "🥇";
  if (rank <= 25) return "🥈";
  if (rank <= 50) return "🥉";
  return "⚡";
};

const getRankColor = (rank: number): string => {
  if (rank <= 5) return "text-yellow-400";
  if (rank <= 10) return "text-yellow-300";
  if (rank <= 25) return "text-orange-400";
  return "text-neutral-100";
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

const normalizeCountryCode = (countryCode?: string | null): string | undefined => {
  if (!countryCode) return undefined;
  const trimmed = countryCode.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === "uk") return "gb";
  return trimmed;
};

const FlagIcon = ({ countryCode }: { countryCode: string }) => {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return null;
  const isoCode = normalized.toUpperCase();
  const flagHeight = "0.7rem";
  const flagWidth = `calc(${flagHeight} * 4 / 3)`;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-neutral-700/80 rounded-md border border-neutral-600/50 shadow-sm backdrop-blur-sm"
      title={isoCode}
    >
      <span
        className={`fi fi-${normalized}`}
        aria-hidden="true"
        style={{
          width: flagWidth,
          minWidth: flagWidth,
          height: flagHeight,
          boxShadow: "0 0 0 1px rgba(0,0,0,0.35)",
          borderRadius: "0.25rem",
        }}
      />
      <span className="uppercase tracking-wide font-mono font-semibold text-neutral-200 text-[0.6rem]">
        {isoCode}
      </span>
    </span>
  );
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

const normalizePlayerId = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeIdentifier = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const transformMatchRow = (row: OpponentMatchHistoryApiResponse["rows"][number]): OpponentMatch => {
  const startTime = row.startedAt ? new Date(row.startedAt).getTime() : undefined;
  const completedTime = row.completedAt ? new Date(row.completedAt).getTime() : undefined;
  const players: OpponentMatchPlayer[] = Array.isArray(row.players)
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

  return {
    matchId: row.matchId,
    mapIdentifier: normalizeIdentifier(row.mapIdentifier) ?? normalizeIdentifier(row.mapName),
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
    players,
  };
};

export default function FrequentOpponentsCard({
  profileId,
  windowDays,
  matchScope,
  onMatchScopeChange,
  onPlayerNavigate,
}: FrequentOpponentsCardProps) {
  const { refresh } = useAdvancedStats();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<OpponentRow[]>([]);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [matchHistory, setMatchHistory] = useState<Record<string, MatchHistoryState>>({});

  const profileIdStr = useMemo(() => coerceProfileId(profileId), [profileId]);

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
        const response = await fetch(`/api/premium/opponents?${buildParams(profileIdStr, windowDays, matchScope)}`, {
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
        if (payload.matchScope && payload.matchScope !== matchScope) {
          onMatchScopeChange(payload.matchScope);
        }
      } catch (fetchError) {
        if (cancelled) return;
        if ((fetchError as Error).name === "AbortError") return;
        console.error("[premium] opponent stats fetch failed", fetchError);
        setError((fetchError as Error).message || "Failed to load opponent statistics");
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
  }, [profileIdStr, windowDays, matchScope, refresh, onMatchScopeChange]);

  useEffect(() => {
    setExpandedRows({});
    setMatchHistory({});
  }, [profileIdStr, windowDays, matchScope]);

  const fetchMatchHistory = useCallback(async (opponentProfileId: string) => {
    if (!profileIdStr) return;
    setMatchHistory((prev) => ({
      ...prev,
      [opponentProfileId]: {
        loading: true,
        error: null,
        matches: [],
      },
    }));

    try {
      const response = await fetch(`/api/premium/opponents/matches?${buildMatchParams(profileIdStr, windowDays, matchScope, opponentProfileId)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as OpponentMatchHistoryApiResponse;
        throw new Error(payload.reason || `HTTP ${response.status}`);
      }

      const payload = (await response.json()) as OpponentMatchHistoryApiResponse;
      const matches = Array.isArray(payload.rows) ? payload.rows.map(transformMatchRow) : [];

      setMatchHistory((prev) => ({
        ...prev,
        [opponentProfileId]: {
          loading: false,
          error: null,
          matches,
        },
      }));
    } catch (fetchError) {
      console.error("[premium] opponent match history fetch failed", fetchError);
      setMatchHistory((prev) => ({
        ...prev,
        [opponentProfileId]: {
          loading: false,
          error: (fetchError as Error).message || "Failed to load match history",
          matches: [],
        },
      }));
    }
  }, [profileIdStr, windowDays, matchScope]);

  const matchScopeOptions: Array<{ value: MatchScope; label: string }> = useMemo(() => ([
    { value: "automatch", label: "Automatch" },
    { value: "custom", label: "Custom" },
    { value: "all", label: "All" },
  ]), []);

  const handleMatchScopeChange = (value: MatchScope) => {
    if (value === matchScope) return;
    onMatchScopeChange(value);
  };

  const handleRowToggle = (row: OpponentRow) => {
    const key = row.opponentProfileId ?? row.opponentAlias;
    if (!key) return;
    if (!row.opponentProfileId) return; // cannot expand without profile id
    const nextExpanded = !expandedRows[key];
    setExpandedRows((prev) => ({
      ...prev,
      [key]: nextExpanded,
    }));

    if (nextExpanded && row.opponentProfileId) {
      if (!matchHistory[row.opponentProfileId]) {
        void fetchMatchHistory(row.opponentProfileId);
      }
    }
  };

  const renderRosterEntries = (entries: RosterEntry[], extraCount: number, align: "start" | "end" = "start") => (
    <div
      className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-neutral-200 ${align === "end" ? "sm:justify-end" : ""}`}
    >
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

  const renderMatchCard = (match: OpponentMatch) => {
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

    const normalizedMapId = normalizeIdentifier(match.mapIdentifier) ?? normalizeIdentifier(match.mapName);
    const mapDisplayName = getMapName(normalizedMapId) || match.mapName || "Unknown Map";
    const mapImagePath = getMapImage(normalizedMapId);
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

  const renderMatchHistory = (row: OpponentRow) => {
    if (!row.opponentProfileId) {
      return (
        <div className="mt-3 rounded-lg border border-neutral-700/40 bg-neutral-900/60 p-3 text-xs text-neutral-300">
          Detailed match history requires a linked profile for this opponent.
        </div>
      );
    }

    const state = matchHistory[row.opponentProfileId];

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
          No matches with this opponent in the selected window.
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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h4 className="text-lg font-semibold text-white">Frequent opponents</h4>
          <p className="text-xs text-neutral-400">Your most common opponents and head-to-head record.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {matchScopeOptions.map((option) => {
            const active = matchScope === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleMatchScopeChange(option.value)}
                className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-yellow-500/50 bg-yellow-500/20 text-yellow-200 shadow"
                    : "border-neutral-700/60 bg-neutral-900/60 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800/60 hover:text-white"
                }`}
                aria-pressed={active}
              >
                {option.label}
              </button>
            );
          })}
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
                <th className="px-3 py-2 w-16 text-center">Rank</th>
                <th className="px-4 py-2">Opponent</th>
                <th className="px-4 py-2">Matches</th>
                <th className="px-4 py-2">Record</th>
                <th className="px-4 py-2">Win rate</th>
                <th className="px-4 py-2">Last played</th>
                <th className="px-3 py-2 text-right w-12" aria-hidden />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {rows.map((row, index) => {
                const key = row.opponentProfileId ?? row.opponentAlias;
                const expanded = Boolean(expandedRows[key]);
                const rank = index + 1;
                const faction = raceIdToFaction(row.opponentMainRaceId ?? undefined);
                const aliasClick = getPlayerClickHandler(row.opponentAlias, row.opponentProfileId);
                return (
                  <Fragment key={key}>
                    <tr
                      className={`group transition ${expanded ? "bg-neutral-800/40" : "hover:bg-neutral-800/30"} ${row.opponentProfileId ? "cursor-pointer" : "cursor-default"}`}
                      onClick={() => row.opponentProfileId ? handleRowToggle(row) : undefined}
                      aria-expanded={expanded}
                      aria-label={row.opponentProfileId ? `${expanded ? "Collapse" : "Expand"} match history with ${row.opponentAlias}` : undefined}
                    >
                      <td className="px-3 py-3 text-center font-semibold text-white">
                        <span className={`flex items-center justify-center gap-1 ${getRankColor(rank)}`}>
                          <span>{getTierIndicator(rank)}</span>
                          <span>{rank}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          {row.opponentCountry && <FlagIcon countryCode={row.opponentCountry} />}
                          {aliasClick ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                aliasClick();
                              }}
                              className="group inline-flex items-center gap-1 rounded-md border border-transparent px-1.5 py-0.5 text-white font-semibold transition hover:border-neutral-600 hover:bg-neutral-800/70 hover:underline"
                              aria-label={`View profile search for ${row.opponentAlias}`}
                            >
                              {row.opponentAlias}
                              <svg
                                className="h-3.5 w-3.5 text-neutral-400 transition group-hover:text-neutral-200"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <circle cx="11" cy="11" r="6" />
                                <line x1="20" y1="20" x2="16.65" y2="16.65" />
                              </svg>
                            </button>
                          ) : (
                            <span className="text-white font-semibold">{row.opponentAlias}</span>
                          )}
                          {faction !== "Unknown" && (
                            <span className={`text-xs font-semibold ${getFactionColor(faction)} inline-flex items-center gap-1`}>
                              <FactionLogo faction={faction} size={14} />
                              {faction}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">{row.matches}</td>
                      <td className="px-4 py-3 text-neutral-300">{row.wins}-{row.losses}</td>
                      <td className="px-4 py-3">{formatPercent(row.winrate)}</td>
                      <td className="px-4 py-3 text-neutral-400">{row.lastPlayed ? formatLastMatch(row.lastPlayed) : "—"}</td>
                      <td className="px-3 py-3 text-right">
                        {row.opponentProfileId ? (
                          <span
                            aria-hidden="true"
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700/50 bg-neutral-900/60 text-neutral-400 transition group-hover:text-neutral-200 group-hover:border-neutral-500/60 ${expanded ? "rotate-90 text-yellow-300 border-yellow-500/40" : ""}`}
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="9 18 15 12 9 6" />
                            </svg>
                          </span>
                        ) : (
                          <span className="text-neutral-600 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                    {expanded && row.opponentProfileId && (
                      <tr>
                        <td className="py-0" colSpan={7}>
                          {renderMatchHistory(row)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
