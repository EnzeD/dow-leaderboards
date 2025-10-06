"use client";

import { useEffect, useMemo, useState } from "react";
import { AdvancedStatsContext, useAdvancedStatsContext } from "./AdvancedStatsContext";
import { useAdvancedStatsActivation } from "@/hooks/useAdvancedStatsActivation";
import { Leaderboard } from "@/lib/relic";
import { useCombinedLeaderboards } from "../useCombinedLeaderboards";
import AdvancedStatsTeaser from "./AdvancedStatsTeaser";
import EloHistoryCard from "./EloHistoryCard";
import MatchupMatrixCard from "./MatchupMatrixCard";
import MapPerformanceCard from "./MapPerformanceCard";
import FrequentOpponentsCard from "./FrequentOpponentsCard";
import ProfileOverviewCard, { ProfileOverview } from "./ProfileOverviewCard";

export type AdvancedStatsPanelProps = {
  profileId?: string | number | null;
  alias?: string | null;
  activatedOverride?: boolean;
  onRequestAccess?: () => void;
  variant?: "standalone" | "embedded";
};

type AdvancedStatsSection = "elo" | "matchups" | "maps" | "opponents";

const SECTIONS: Array<{ id: AdvancedStatsSection; label: string }> = [
  { id: "elo", label: "Elo history" },
  { id: "matchups", label: "Matchups" },
  { id: "maps", label: "Maps" },
  { id: "opponents", label: "Opponents" },
];

type OverviewApiResponse = {
  activated: boolean;
  profileId: string;
  totals?: {
    matches?: number;
    matchesLast7Days?: number;
    leaderboardWins?: number;
    leaderboardLosses?: number;
    leaderboardTotal?: number;
    leaderboardWinrate?: number | string | null;
  };
  lastXpSync?: string | null;
  reason?: string;
};

export default function AdvancedStatsPanel({
  profileId,
  alias,
  activatedOverride,
  onRequestAccess,
  variant = "standalone",
}: AdvancedStatsPanelProps) {
  const activation = useAdvancedStatsActivation(profileId);
  const leaderboards = useCombinedLeaderboards();

  const contextValue = useMemo(() => ({
    ...activation,
    ready: Boolean(profileId) && (activation.activated || activatedOverride),
  }), [activation, activatedOverride, profileId]);

  const profileIdStr = useMemo(() => {
    if (profileId === undefined || profileId === null) return null;
    const cast = String(profileId).trim();
    return cast.length > 0 ? cast : null;
  }, [profileId]);

  const [selectedLeaderboardId, setSelectedLeaderboardId] = useState<number | "best" | "all" | null>(null);
  const [windowDays, setWindowDays] = useState<number>(90);
  const [activeSection, setActiveSection] = useState<AdvancedStatsSection>("elo");
  const [overview, setOverview] = useState<ProfileOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  useEffect(() => {
    setActiveSection("elo");
  }, [profileIdStr]);

  useEffect(() => {
    setSelectedLeaderboardId(null);
  }, [profileIdStr]);

  useEffect(() => {
    if (!profileIdStr || !contextValue.ready) {
      setOverview(null);
      setOverviewLoading(false);
      setOverviewError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const fetchOverview = async () => {
      setOverviewLoading(true);
      setOverviewError(null);
      try {
        const response = await fetch(`/api/premium/overview?profileId=${encodeURIComponent(profileIdStr)}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => ({} as OverviewApiResponse)) as OverviewApiResponse;

        if (!response.ok) {
          const reason = typeof payload?.reason === "string" ? payload.reason : `HTTP_${response.status}`;
          throw new Error(reason);
        }

        if (cancelled) return;

        if (payload?.totals) {
          setOverview({
            matches: Number(payload.totals.matches ?? 0),
            matchesLast7Days: Number(payload.totals.matchesLast7Days ?? 0),
            leaderboardWins: Number(payload.totals.leaderboardWins ?? 0),
            leaderboardLosses: Number(payload.totals.leaderboardLosses ?? 0),
            leaderboardTotal: Number(payload.totals.leaderboardTotal ?? 0),
            leaderboardWinrate: payload.totals.leaderboardWinrate === null || payload.totals.leaderboardWinrate === undefined
              ? null
              : Number(payload.totals.leaderboardWinrate),
            lastXpSync: payload.lastXpSync ?? null,
          });
        } else {
          setOverview(null);
        }
      } catch (error) {
        if (cancelled) return;
        if ((error as Error).name === "AbortError") return;
        console.error("[premium] overview fetch failed", error);
        setOverview(null);
        setOverviewError((error as Error).message ?? "overview_fetch_failed");
      } finally {
        if (!cancelled) {
          setOverviewLoading(false);
        }
      }
    };

    fetchOverview();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [profileIdStr, contextValue.ready]);

  if (!profileIdStr) {
    return null;
  }

  if (!contextValue.ready) {
    return (
      <AdvancedStatsContext.Provider value={contextValue}>
        <AdvancedStatsTeaser
          alias={alias}
          refresh={contextValue.refresh}
          loading={contextValue.loading}
          onRequestAccess={onRequestAccess}
        />
      </AdvancedStatsContext.Provider>
    );
  }

  const options = buildLeaderboardOptions(leaderboards);

  const handleLeaderboardChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === "best" || value === "all") {
      setSelectedLeaderboardId(value);
    } else if (value === "") {
      setSelectedLeaderboardId(null);
    } else {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        setSelectedLeaderboardId(parsed);
      }
    }
  };

  const containerClass = variant === "embedded"
    ? "rounded-xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-lg space-y-4"
    : "space-y-6";

  const titleClass = variant === "embedded" ? "text-lg font-semibold text-white" : "text-2xl font-semibold text-white";
  const descriptionClass = variant === "embedded" ? "text-xs text-neutral-400" : "text-sm text-neutral-400 mt-1";

  const displayName = alias || (profileIdStr ?? "this profile");

  const intro = (
    <div>
      <p className="text-xs uppercase tracking-[0.4em] text-yellow-400">Premium analytics</p>
      <h3 className={titleClass}>Advanced statistics</h3>
      <p className={descriptionClass}>
        Detailed insights for {displayName} across ratings, matchups, maps, and opponents.
      </p>
    </div>
  );

  const controls = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
      <label className="text-xs text-neutral-400" htmlFor="advanced-stats-window">Time window</label>
      <select
        id="advanced-stats-window"
        value={windowDays}
        onChange={(event) => setWindowDays(Number(event.target.value))}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
      >
        <option value={30}>Last 30 days</option>
        <option value={60}>Last 60 days</option>
        <option value={90}>Last 90 days</option>
        <option value={180}>Last 180 days</option>
        <option value={365}>Last 365 days</option>
      </select>
      <label className="text-xs text-neutral-400" htmlFor="advanced-stats-leaderboard">Leaderboard</label>
      <select
        id="advanced-stats-leaderboard"
        value={selectedLeaderboardId ?? ""}
        onChange={handleLeaderboardChange}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200"
      >
        <option value="">All leaderboards</option>
        <option value="best">Best leaderboard</option>
        <option value="all">Show all placements</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </div>
  );

  const sectionNav = (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map(({ id, label }) => {
        const active = activeSection === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition ${
              active
                ? 'bg-yellow-500/20 text-yellow-200 border-yellow-500/40 shadow'
                : 'bg-neutral-900/60 text-neutral-300 border-neutral-700/60 hover:bg-neutral-800/60 hover:text-white'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const renderActiveSection = () => {
    switch (activeSection) {
      case "elo":
        return (
          <EloHistoryCard
            profileId={profileIdStr}
            windowDays={windowDays}
            leaderboardId={selectedLeaderboardId}
          />
        );
      case "matchups":
        return (
          <MatchupMatrixCard
            profileId={profileIdStr}
            windowDays={windowDays}
            matchTypeId={null}
          />
        );
      case "maps":
        return (
          <MapPerformanceCard
            profileId={profileIdStr}
            windowDays={windowDays}
            matchTypeId={null}
          />
        );
      case "opponents":
      default:
        return (
          <FrequentOpponentsCard
            profileId={profileIdStr}
            windowDays={windowDays}
            matchTypeId={null}
          />
        );
    }
  };

  return (
    <AdvancedStatsContext.Provider value={contextValue}>
      <div className={containerClass}>
        {variant === "embedded" ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {intro}
            {controls}
          </div>
        ) : (
          <header className="rounded-2xl border border-yellow-500/20 bg-neutral-950/90 p-4 shadow-xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {intro}
              {controls}
            </div>
          </header>
        )}

        <ProfileOverviewCard overview={overview} loading={overviewLoading} error={overviewError} />

        {variant === "embedded" ? sectionNav : (
          <div className="px-1">{sectionNav}</div>
        )}

        <div className="space-y-4">
          {renderActiveSection()}
        </div>
      </div>
    </AdvancedStatsContext.Provider>
  );
}

const buildLeaderboardOptions = (leaderboards: Leaderboard[]): Array<{ value: number; label: string }> => {
  return leaderboards
    .filter((lb) => lb?.id)
    .map((lb) => ({
      value: lb.id,
      label: `${lb.matchType ?? ""} ${lb.faction ?? ""}`.trim() || lb.name || `Leaderboard ${lb.id}`,
    }));
};

export const useAdvancedStats = () => useAdvancedStatsContext();
