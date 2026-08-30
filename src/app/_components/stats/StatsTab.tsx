"use client";

import { useEffect, useMemo, useState } from "react";
import StatsMapsPanel from "@/app/_components/stats/StatsMapsPanel";
import StatsRacePickrateChart from "@/app/_components/stats/StatsRacePickrateChart";
import StatsMatchupsHeatmap from "@/app/_components/stats/StatsMatchupsHeatmap";
import { formatCount } from "@/lib/stats-formatters";
import { getEventTracker } from "@/lib/analytics/event-tracker";
import type { StatsPatchPeriod } from "@/lib/stats-patches";

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
  const [patch, setPatch] = useState("all");
  const [patches, setPatches] = useState<StatsPatchPeriod[]>([]);
  const [patchCatalogState, setPatchCatalogState] = useState<"loading" | "ready" | "stale" | "error">("loading");
  const [catalogReload, setCatalogReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setPatchCatalogState("loading");
    const load = async () => {
      try {
        const response = await fetch("/api/stats/patches", { signal: controller.signal });
        if (!response.ok) throw new Error("patch_catalog_unavailable");
        const catalog = await response.json() as { patches: StatsPatchPeriod[]; stale: boolean };
        if (controller.signal.aborted) return;
        setPatches(catalog.patches);
        setPatchCatalogState(catalog.stale ? "stale" : "ready");
      } catch {
        if (!controller.signal.aborted) setPatchCatalogState("error");
      }
    };
    void load();
    return () => controller.abort();
  }, [catalogReload]);

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
    setTotalMatches(null);
    setSummaryError(null);

    const loadSummary = async () => {
      try {
        const res = await fetch(`/api/stats/summary?minRating=${ratingFloor}&patch=${encodeURIComponent(patch)}`);
        if (!res.ok) {
          if (!cancelled) setSummaryError("Total matches unavailable");
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
  }, [ratingFloor, patch]);

  const selectedPatch = patches.find(item => item.version === patch);
  const lastIncludedDay = selectedPatch && selectedPatch.endDay > selectedPatch.startDay
    ? new Date(Date.parse(`${selectedPatch.endDay}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    : null;

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
          <label className="mr-3 flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Patch</span>
            <select
              value={patch}
              onChange={event => setPatch(event.target.value)}
              disabled={patchCatalogState === "loading" || patchCatalogState === "error"}
              className="rounded-md border border-neutral-700/80 bg-neutral-900/80 px-2 py-1 text-sm text-white focus:border-neutral-400 focus:outline-none disabled:opacity-50"
            >
              <option value="all">All patches</option>
              {[...patches].reverse().map(item => (
                <option key={item.version} value={item.version}>{item.version}</option>
              ))}
            </select>
          </label>
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
        {patchCatalogState === "error" || patchCatalogState === "stale" ? (
          <p className="text-xs text-amber-400">
            {patchCatalogState === "error"
              ? "Patch list unavailable."
              : "Steam patch check unavailable. Patch periods are limited to the last verified dates."}
            <button type="button" onClick={() => setCatalogReload(value => value + 1)} className="ml-2 underline">Retry</button>
          </p>
        ) : null}
        {selectedPatch ? (
          <p className="text-xs text-neutral-400">
            Patch {patch}: {lastIncludedDay ? `${selectedPatch.startDay} – ${lastIncludedDay} (UTC).` : "No complete match days yet."}
            {" "}Uses complete UTC match days; patch-release days are excluded. Replaces the rolling time window.
          </p>
        ) : null}
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

      {activeView === "maps" ? <StatsMapsPanel key={patch} ratingFloor={ratingFloor} patch={patch} /> : null}
      {activeView === "pickrate" ? <StatsRacePickrateChart key={patch} ratingFloor={ratingFloor} patch={patch} /> : null}
      {activeView === "matchups" ? <StatsMatchupsHeatmap key={patch} ratingFloor={ratingFloor} patch={patch} /> : null}
    </div>
  );
}
