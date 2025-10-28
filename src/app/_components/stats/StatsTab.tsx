"use client";

import { useEffect, useMemo, useState } from "react";
import StatsMapsPanel from "@/app/_components/stats/StatsMapsPanel";
import StatsRacePickrateChart from "@/app/_components/stats/StatsRacePickrateChart";
import StatsMatchupsHeatmap from "@/app/_components/stats/StatsMatchupsHeatmap";
import { formatCount } from "@/lib/stats-formatters";
import { getEventTracker } from "@/lib/analytics/event-tracker";

type StatsView = "maps" | "pickrate" | "matchups";

const VIEWS: Array<{ key: StatsView; label: string; helper?: string }> = [
  { key: "maps", label: "Maps", helper: "Global 1v1 performance by map" },
  { key: "pickrate", label: "Races pickrate", helper: "Weekly faction share" },
  { key: "matchups", label: "Matchups", helper: "Race-versus-race win rates" },
];

const RATING_FILTERS: Array<{ value: number; label: string }> = [
  { value: 0, label: "All" },
  { value: 1200, label: "1200+" },
  { value: 1400, label: "1400+" },
];

interface StatsTabProps {
  auth0Sub?: string | null;
}

export default function StatsTab({ auth0Sub }: StatsTabProps = {}) {
  const [activeView, setActiveView] = useState<StatsView>("maps");
  const [totalMatches, setTotalMatches] = useState<number | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [ratingFloor, setRatingFloor] = useState<number>(0);

  // Track stats sub-tab changes
  useEffect(() => {
    const tracker = getEventTracker(auth0Sub);
    tracker.track({
      event_type: 'page_view',
      event_name: 'page_viewed',
      properties: {
        page_name: `stats:${activeView}`,
        parent_page: 'stats'
      }
    });
  }, [activeView, auth0Sub]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const res = await fetch(`/api/stats/summary?minRating=${ratingFloor}`);
        if (!res.ok) {
          setSummaryError("Total matches unavailable");
          return;
        }
        const payload = (await res.json()) as {
          totalMatches: number;
          ratingFloor?: number;
        };
        if (!cancelled) {
          setTotalMatches(Number.isFinite(payload.totalMatches) ? payload.totalMatches : 0);
          setSummaryError(null);
        }
      } catch (error) {
        console.error("[stats] summary fetch failed", error);
        if (!cancelled) {
          setSummaryError("Total matches unavailable");
        }
      }
    };

    loadSummary();

    return () => {
      cancelled = true;
    };
  }, [ratingFloor]);

  const activeHelper = useMemo(() => {
    const entry = VIEWS.find(v => v.key === activeView);
    return entry?.helper ?? "";
  }, [activeView]);

  const ratingLabel = useMemo(() => {
    const filter = RATING_FILTERS.find(option => option.value === ratingFloor);
    return filter?.label ?? "All";
  }, [ratingFloor]);

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {VIEWS.map(view => {
            const isActive = view.key === activeView;
            return (
              <button
                key={view.key}
                type="button"
                onClick={() => setActiveView(view.key)}
                aria-pressed={isActive}
                className={[
                  "rounded-full border px-4 py-1.5 text-sm font-medium transition",
                  isActive
                    ? "border-white/80 bg-white text-neutral-900 shadow-lg shadow-white/20"
                    : "border-neutral-700/80 bg-neutral-800/70 text-neutral-300 hover:border-neutral-500 hover:text-white",
                ].join(" ")}
              >
                {view.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            ELO filter
          </span>
          {RATING_FILTERS.map(filter => {
            const isActive = filter.value === ratingFloor;
            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => setRatingFloor(filter.value)}
                aria-pressed={isActive}
                className={[
                  "rounded-full border px-3 py-1 text-xs font-semibold transition",
                  isActive
                    ? "border-white/80 bg-white text-neutral-900 shadow shadow-white/20"
                    : "border-neutral-700/70 bg-neutral-900/70 text-neutral-300 hover:border-neutral-500 hover:text-white",
                ].join(" ")}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-400">
          {activeHelper ? <span>{activeHelper}</span> : null}
          {totalMatches !== null ? (
            <span className="text-neutral-500">
              • Tracking {formatCount(totalMatches)} ranked 1v1 matches
              {ratingFloor > 0 ? ` (ELO >= ${ratingFloor})` : ""}
            </span>
          ) : summaryError ? (
            <span className="text-amber-400">{summaryError}</span>
          ) : null}
          <span className="text-neutral-500">• Showing {ratingLabel}</span>
        </div>
      </header>

      {activeView === "maps" ? <StatsMapsPanel ratingFloor={ratingFloor} /> : null}
      {activeView === "pickrate" ? <StatsRacePickrateChart ratingFloor={ratingFloor} /> : null}
      {activeView === "matchups" ? <StatsMatchupsHeatmap ratingFloor={ratingFloor} /> : null}
    </div>
  );
}
