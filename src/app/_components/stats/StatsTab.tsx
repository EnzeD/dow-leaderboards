"use client";

import { useMemo, useState } from "react";
import StatsMapsPanel from "@/app/_components/stats/StatsMapsPanel";
import StatsRacePickrateChart from "@/app/_components/stats/StatsRacePickrateChart";
import StatsMatchupsHeatmap from "@/app/_components/stats/StatsMatchupsHeatmap";

type StatsView = "maps" | "pickrate" | "matchups";

const VIEWS: Array<{ key: StatsView; label: string; helper?: string }> = [
  { key: "maps", label: "Maps", helper: "Global 1v1 performance by map" },
  { key: "pickrate", label: "Races pickrate", helper: "Weekly faction share" },
  { key: "matchups", label: "Matchups", helper: "Race-versus-race win rates" },
];

export default function StatsTab() {
  const [activeView, setActiveView] = useState<StatsView>("maps");

  const activeHelper = useMemo(() => {
    const entry = VIEWS.find(v => v.key === activeView);
    return entry?.helper ?? "";
  }, [activeView]);

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
        {activeHelper ? (
          <p className="text-sm text-neutral-400">
            {activeHelper}
          </p>
        ) : null}
      </header>

      {activeView === "maps" ? <StatsMapsPanel /> : null}
      {activeView === "pickrate" ? <StatsRacePickrateChart /> : null}
      {activeView === "matchups" ? <StatsMatchupsHeatmap /> : null}
    </div>
  );
}
