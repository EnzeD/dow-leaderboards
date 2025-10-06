"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Label } from "recharts";
import { useAdvancedStats } from "./AdvancedStatsPanel";

export type EloHistoryCardProps = {
  profileId: string | number;
  leaderboardId: number | "best" | "all" | null;
  windowDays: number;
};

type EloSample = {
  timestamp: string;
  leaderboardId: number;
  rating: number | null;
  rank: number | null;
  rankTotal: number | null;
};

type EloApiResponse = {
  activated: boolean;
  profileId: string;
  leaderboardId?: number;
  windowStart: string;
  generatedAt: string;
  samples: EloSample[];
  reason?: string;
};

type LeaderboardInfo = {
  id: number;
  name: string;
  display_name: string | null;
  labelWithRating?: string;
};

const formatDate = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const formatRating = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  return value.toString();
};

const coerceProfileId = (value: string | number): string => {
  return typeof value === "string" ? value : value.toString();
};

const buildQueryParams = (profileId: string, windowDays: number, leaderboardId: number | "best" | "all" | null) => {
  const params = new URLSearchParams();
  params.set("profileId", profileId);
  params.set("windowDays", String(windowDays));
  if (typeof leaderboardId === "number") {
    params.set("leaderboardId", String(leaderboardId));
  }
  return params.toString();
};

// Custom label component for rating values
const RatingLabel = (props: any) => {
  const { x, y, value } = props;
  if (value === null || value === undefined) return null;

  return (
    <text
      x={x}
      y={y}
      dy={-10}
      fill="#fbbf24"
      fontSize={11}
      fontWeight="600"
      textAnchor="middle"
    >
      {value}
    </text>
  );
};

// Custom label component for rank values
const RankLabel = (props: any) => {
  const { x, y, value } = props;
  if (value === null || value === undefined) return null;

  return (
    <text
      x={x}
      y={y}
      dy={-10}
      fill="#3b82f6"
      fontSize={11}
      fontWeight="600"
      textAnchor="middle"
    >
      {value}
    </text>
  );
};

export default function EloHistoryCard({ profileId, leaderboardId, windowDays }: EloHistoryCardProps) {
  const { refresh: refreshActivation } = useAdvancedStats();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allData, setAllData] = useState<EloSample[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [windowStart, setWindowStart] = useState<string | null>(null);
  const [availableLeaderboards, setAvailableLeaderboards] = useState<LeaderboardInfo[]>([]);
  const [selectedLeaderboard, setSelectedLeaderboard] = useState<number | null>(null);

  const profileIdStr = useMemo(() => coerceProfileId(profileId), [profileId]);

  // Fetch all data (all leaderboards)
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = buildQueryParams(profileIdStr, windowDays, null); // Fetch all
        const response = await fetch(`/api/premium/elo-history?${params}`, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as EloApiResponse;
          throw new Error(payload.reason || `HTTP ${response.status}`);
        }

        const payload = (await response.json()) as EloApiResponse;

        if (cancelled) return;
        setAllData(payload.samples || []);
        setGeneratedAt(payload.generatedAt || null);
        setWindowStart(payload.windowStart || null);
      } catch (error) {
        if (cancelled) return;
        if ((error as Error).name === "AbortError") return;
        console.error("[premium] elo history fetch failed", error);
        setError((error as Error).message || "Failed to load Elo history");
        setAllData([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [profileIdStr, windowDays, refreshActivation]);

  // Fetch leaderboard names directly from Supabase
  useEffect(() => {
    let cancelled = false;

    const fetchLeaderboards = async () => {
      try {
        // Import supabase dynamically to avoid build issues
        const { supabase } = await import('@/lib/supabase');

        const { data, error } = await supabase
          .from('leaderboards')
          .select('id, name, display_name')
          .order('id');

        if (error) {
          console.error('[premium] leaderboards query error', error);
          return;
        }

        if (cancelled) return;

        const leaderboards = (data || []).map((lb) => ({
          id: lb.id,
          name: lb.name || `Leaderboard ${lb.id}`,
          display_name: lb.display_name || lb.name || `Leaderboard ${lb.id}`,
        }));

        setAvailableLeaderboards(leaderboards);
      } catch (error) {
        console.error('[premium] failed to fetch leaderboards', error);
      }
    };

    fetchLeaderboards();

    return () => {
      cancelled = true;
    };
  }, []);

  // Process data for selected leaderboard
  const chartData = useMemo(() => {
    if (allData.length === 0) return [];

    // Group by leaderboard to find which ones the player has
    const byLeaderboard = new Map<number, EloSample[]>();
    allData.forEach(sample => {
      // Include combined (-1) now
      if (!byLeaderboard.has(sample.leaderboardId)) {
        byLeaderboard.set(sample.leaderboardId, []);
      }
      byLeaderboard.get(sample.leaderboardId)!.push(sample);
    });

    // Auto-select best leaderboard on first load
    if (selectedLeaderboard === null && byLeaderboard.size > 0) {
      let bestLb = -1;
      let highestRating = 0;

      byLeaderboard.forEach((samples, lbId) => {
        const maxRating = Math.max(...samples.map(s => s.rating || 0));
        if (maxRating > highestRating) {
          highestRating = maxRating;
          bestLb = lbId;
        }
      });

      if (bestLb !== -1) {
        setSelectedLeaderboard(bestLb);
      }
    }

    // Get data for selected leaderboard
    const lbId = selectedLeaderboard ?? -1;
    const samples = byLeaderboard.get(lbId) || [];

    return samples
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(sample => ({
        timestamp: sample.timestamp,
        rating: sample.rating,
        rank: sample.rank,
      }));
  }, [allData, selectedLeaderboard]);

  // Get available leaderboards for this player
  const playerLeaderboards = useMemo(() => {
    const lbIds = new Set<number>();
    allData.forEach(sample => {
      lbIds.add(sample.leaderboardId);
    });

    return availableLeaderboards
      .filter(lb => {
        // Skip Custom leaderboard
        if (lb.name?.toLowerCase().includes('custom')) return false;
        return lbIds.has(lb.id);
      })
      .sort((a, b) => {
        // Sort by max rating
        const samplesA = allData.filter(s => s.leaderboardId === a.id);
        const samplesB = allData.filter(s => s.leaderboardId === b.id);
        const maxA = Math.max(...samplesA.map(s => s.rating || 0));
        const maxB = Math.max(...samplesB.map(s => s.rating || 0));
        return maxB - maxA;
      })
      .map(lb => {
        // Add current rating to label
        const samples = allData.filter(s => s.leaderboardId === lb.id);
        const latestRating = samples.length > 0
          ? samples[samples.length - 1].rating
          : null;

        let label = lb.display_name || lb.name || `Leaderboard ${lb.id}`;
        if (lb.id === 0) {
          label = '1v1 Combined';
        }
        if (latestRating !== null) {
          label += ` (${latestRating})`;
        }

        return { ...lb, labelWithRating: label };
      });
  }, [allData, availableLeaderboards]);

  const selectedLeaderboardName = useMemo(() => {
    const lb = playerLeaderboards.find(l => l.id === selectedLeaderboard);
    if (lb) return lb.labelWithRating;

    if (selectedLeaderboard === 0) return '1v1 Combined';

    const fallback = availableLeaderboards.find(l => l.id === selectedLeaderboard);
    return fallback?.display_name || fallback?.name || `Leaderboard ${selectedLeaderboard}`;
  }, [selectedLeaderboard, playerLeaderboards, availableLeaderboards]);

  // Calculate rank axis domain to show meaningful range
  const rankDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];

    const ranks = chartData.map(d => d.rank).filter(r => r !== null) as number[];
    if (ranks.length === 0) return [0, 100];

    const minRank = Math.min(...ranks);
    const maxRank = Math.max(...ranks);

    // If player is consistently rank 1, show 1-50 range
    if (minRank === 1 && maxRank === 1) {
      return [1, 50];
    }

    // Add 20% padding
    const range = maxRank - minRank;
    const padding = Math.max(10, Math.ceil(range * 0.2));

    return [
      Math.max(1, minRank - padding),
      maxRank + padding
    ];
  }, [chartData]);

  // Calculate rating axis domain (+/- 200 from min/max)
  const ratingDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 2000];

    const ratings = chartData.map(d => d.rating).filter(r => r !== null) as number[];
    if (ratings.length === 0) return [0, 2000];

    const minRating = Math.min(...ratings);
    const maxRating = Math.max(...ratings);

    return [
      Math.max(0, minRating - 200),
      maxRating + 200
    ];
  }, [chartData]);

  return (
    <section className="rounded-2xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-xl">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h4 className="text-lg font-semibold text-white">Rating & Rank History</h4>
            <p className="text-xs text-neutral-400">Track rating and rank changes over time</p>
          </div>
          <div className="text-xs text-neutral-500">
            {windowStart && <span>Since: {new Date(windowStart).toLocaleDateString()}</span>}
          </div>
        </div>

        {allData.length > 0 && (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3 border-t border-neutral-700/40 pt-3">
            <label className="text-sm font-medium text-neutral-300" htmlFor="elo-leaderboard-select">
              Leaderboard:
            </label>
            {playerLeaderboards.length > 0 ? (
              <>
                <select
                  id="elo-leaderboard-select"
                  value={selectedLeaderboard ?? ''}
                  onChange={(e) => setSelectedLeaderboard(Number(e.target.value))}
                  className="flex-1 sm:flex-initial rounded-md border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white font-medium hover:border-neutral-500 focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500 outline-none"
                >
                  {playerLeaderboards.map(lb => (
                    <option key={lb.id} value={lb.id}>
                      {lb.labelWithRating}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-neutral-500">
                  {playerLeaderboards.length} leaderboard{playerLeaderboards.length !== 1 ? 's' : ''} available
                </span>
              </>
            ) : (
              <div className="flex-1 sm:flex-initial px-3 py-2 text-sm text-neutral-400">
                {selectedLeaderboard !== null ? `Leaderboard ${selectedLeaderboard}` : 'Loading leaderboards...'}
              </div>
            )}
          </div>
        )}
      </header>

      {loading && (
        <div className="mt-6 h-96 w-full animate-pulse rounded-xl bg-neutral-800/60" aria-hidden />
      )}

      {!loading && error && (
        <div className="mt-6 rounded-lg border border-red-500/30 bg-red-900/20 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && allData.length === 0 && (
        <div className="mt-6 rounded-lg border border-neutral-700/40 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          No snapshot data available yet. Check back after daily snapshots are collected.
        </div>
      )}

      {!loading && !error && allData.length > 0 && chartData.length === 0 && (
        <div className="mt-6 rounded-lg border border-neutral-700/40 bg-neutral-900/60 p-4 text-sm text-neutral-300">
          No data for selected leaderboard. Try selecting a different leaderboard above.
        </div>
      )}

      {!loading && !error && chartData.length > 0 && (
        <div className="mt-6 space-y-6">
          {chartData.length < 5 && (
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-900/20 p-3 text-xs text-yellow-300">
              Limited data ({chartData.length} snapshot{chartData.length !== 1 ? 's' : ''}). More will be collected daily.
            </div>
          )}

          {/* Dual-axis Chart */}
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 60, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={formatDate}
                  stroke="#9ca3af"
                  style={{ fontSize: '0.75rem' }}
                />
                {/* Left Y-axis for Rating */}
                <YAxis
                  yAxisId="rating"
                  stroke="#fbbf24"
                  style={{ fontSize: '0.75rem' }}
                  domain={ratingDomain}
                  label={{ value: 'Rating', angle: -90, position: 'insideLeft', style: { fill: '#fbbf24', fontSize: '0.75rem' } }}
                />
                {/* Right Y-axis for Rank (reversed so lower rank = higher on chart) */}
                <YAxis
                  yAxisId="rank"
                  orientation="right"
                  reversed
                  stroke="#3b82f6"
                  style={{ fontSize: '0.75rem' }}
                  domain={rankDomain}
                  label={{ value: 'Rank', angle: 90, position: 'insideRight', style: { fill: '#3b82f6', fontSize: '0.75rem' } }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: '1px solid #374151',
                    borderRadius: '0.5rem',
                    fontSize: '0.875rem',
                  }}
                  labelStyle={{ color: '#d1d5db', marginBottom: '0.5rem' }}
                  labelFormatter={(label) => {
                    const date = new Date(label);
                    if (Number.isNaN(date.getTime())) return label;
                    return date.toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: '0.875rem', paddingTop: '1rem' }}
                />
                <Line
                  yAxisId="rating"
                  type="monotone"
                  dataKey="rating"
                  stroke="#fbbf24"
                  strokeWidth={3}
                  dot={{ fill: '#fbbf24', r: 5 }}
                  activeDot={{ r: 7 }}
                  connectNulls
                  name="Rating"
                  label={<RatingLabel />}
                />
                <Line
                  yAxisId="rank"
                  type="monotone"
                  dataKey="rank"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 5 }}
                  activeDot={{ r: 7 }}
                  connectNulls
                  label={<RankLabel />}
                  name="Rank"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Data table (collapsed by default) */}
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium text-neutral-300 hover:text-white">
              View detailed data ({chartData.length} snapshots for {selectedLeaderboardName})
            </summary>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm text-neutral-200">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-neutral-400 border-b border-neutral-700">
                    <th className="pb-2 pr-4">Date</th>
                    <th className="pb-2 pr-4">Rating</th>
                    <th className="pb-2 pr-4">Rank</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {chartData
                    .slice()
                    .reverse()
                    .map((sample, idx) => (
                    <tr key={`${sample.timestamp}-${idx}`} className="hover:bg-neutral-800/30">
                      <td className="py-2 pr-4 text-neutral-300">
                        {new Date(sample.timestamp).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-2 pr-4 text-yellow-400 font-semibold">{formatRating(sample.rating)}</td>
                      <td className="py-2 pr-4 text-blue-400 font-semibold">{formatRating(sample.rank)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
