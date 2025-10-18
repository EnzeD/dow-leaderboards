"use client";

import { useCallback } from "react";

export type AdvancedStatsTeaserProps = {
  alias?: string | null;
  loading?: boolean;
  refresh?: () => void;
  onRequestAccess?: () => void;
};

export default function AdvancedStatsTeaser({ alias, loading, refresh, onRequestAccess }: AdvancedStatsTeaserProps) {
  const handleRefresh = useCallback(() => {
    if (refresh) refresh();
  }, [refresh]);

  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-neutral-950/80 p-6 shadow-2xl">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-yellow-500/40 bg-yellow-500/15 text-yellow-300">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h16" />
            <rect x="6" y="12" width="2.5" height="8" rx="0.6" fill="currentColor" stroke="none" />
            <rect x="11" y="8" width="2.5" height="12" rx="0.6" fill="currentColor" stroke="none" />
            <rect x="16" y="4" width="2.5" height="16" rx="0.6" fill="currentColor" stroke="none" />
          </svg>
        </span>
        <div>
          <h3 className="text-lg font-semibold text-white">Advanced statistics</h3>
          <p className="text-sm text-neutral-400">
            This profile is not yet activated for advanced analytics. Unlock Elo trends, matchup intelligence, and more.
          </p>
          <p className="text-xs text-neutral-500 mt-1">{alias || "Player"} can request access via the advanced statistics program.</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-sm text-neutral-300">
        <span className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 px-3 py-1">
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l2.5 2.5 6-6" />
          </svg>
          Elo rating over time
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 px-3 py-1">
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l2.5 2.5 6-6" />
          </svg>
          Matchup heatmaps
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 px-3 py-1">
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l2.5 2.5 6-6" />
          </svg>
          Map win rates
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-yellow-500/30 px-3 py-1">
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3.5 8.5l2.5 2.5 6-6" />
          </svg>
          Frequent opponents
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/20 px-3 py-2 text-sm font-semibold text-yellow-200 transition hover:bg-yellow-500/30 disabled:opacity-60"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 2v6h-6" />
            <path d="M3 12a9 9 0 0 1 15-6.3l3 3" />
            <path d="M3 22v-6h6" />
            <path d="M21 12a9 9 0 0 1-15 6.3l-3-3" />
          </svg>
          Refresh status
        </button>
        {onRequestAccess && (
          <button
            type="button"
            onClick={onRequestAccess}
            className="inline-flex items-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-3 py-2 text-sm font-semibold text-yellow-100 transition hover:bg-yellow-500/20"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 12a5 5 0 1 0-5-5" />
              <path d="M12 12v7m0 3a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2z" />
            </svg>
            Request access
          </button>
        )}
        <span className="text-xs text-neutral-500">Advanced telemetry in development — activation managed via Supabase dashboard.</span>
      </div>
    </div>
  );
}
