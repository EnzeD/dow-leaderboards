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

  const [selectedLeaderboardId, setSelectedLeaderboardId] = useState<number | "best" | "all" | null>(null);
  const [windowDays, setWindowDays] = useState<number>(90);
  const [activeSection, setActiveSection] = useState<AdvancedStatsSection>("elo");

  useEffect(() => {
    setActiveSection("elo");
  }, [profileId]);

  if (!profileId) {
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

  const intro = (
    <div>
      <p className="text-xs uppercase tracking-[0.4em] text-yellow-400">Premium analytics</p>
      <h3 className={titleClass}>Advanced statistics</h3>
      <p className={descriptionClass}>
        Detailed insights for {alias || `profile ${profileId}`} across ratings, matchups, maps, and opponents.
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
            profileId={profileId}
            windowDays={windowDays}
            leaderboardId={selectedLeaderboardId}
          />
        );
      case "matchups":
        return (
          <MatchupMatrixCard
            profileId={profileId}
            windowDays={windowDays}
            matchTypeId={null}
          />
        );
      case "maps":
        return (
          <MapPerformanceCard
            profileId={profileId}
            windowDays={windowDays}
            matchTypeId={null}
          />
        );
      case "opponents":
      default:
        return (
          <FrequentOpponentsCard
            profileId={profileId}
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
