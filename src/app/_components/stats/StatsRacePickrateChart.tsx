"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { StatsCard } from "@/app/_components/stats/StatsCard";
import { allFactions, getFactionHexColor, getFactionName } from "@/lib/factions";
import { formatCount } from "@/lib/stats-formatters";

type RacePickrateRow = {
  weekStart: string;
  totalMatches: number;
  factionCounts: Record<string, number>;
};

type RacePickrateResponse = {
  weeks: number;
  generatedAt: string;
  rows: RacePickrateRow[];
  reason?: string;
};

type LoadingState = {
  loading: boolean;
  error: string | null;
  data: RacePickrateResponse | null;
};

type ChartDatum = {
  weekStart: string;
  weekLabel: string;
  totalMatches: number;
  [key: `race_${number}` | "weekStart" | "weekLabel" | "totalMatches"]: string | number;
};

const WEEKS_OPTIONS = [6, 12, 24] as const;

const weekLabelFormatter = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
});

const extractErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string") return error;
  return fallback;
};

const formatWeek = (value: string): string => {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return weekLabelFormatter.format(date);
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  const entry = payload[0]?.payload as ChartDatum | undefined;
  if (!entry) return null;

  const totalPicks = payload.reduce((sum: number, item: any) => {
    const dataKey = String(item.dataKey);
    const actual = Number(entry[dataKey as keyof ChartDatum] ?? 0);
    return sum + (Number.isFinite(actual) ? actual : 0);
  }, 0);

  return (
    <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/90 p-4 text-sm text-neutral-100 shadow-lg shadow-black/30">
      <div className="flex items-center justify-between gap-6">
        <strong className="text-base text-white">{label}</strong>
        <span className="text-xs text-neutral-400">
          {formatCount(entry.totalMatches)} matches • {formatCount(totalPicks)} picks
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {payload.map((item: any) => {
          const dataKey = String(item.dataKey);
          const actual = Number(entry[dataKey as keyof ChartDatum] ?? 0);
          if (!Number.isFinite(actual) || actual <= 0) return null;
          const percent = totalPicks > 0 ? ((actual / totalPicks) * 100).toFixed(1) : "0.0";
          const colour = item.color;
          return (
            <div key={dataKey} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colour }}
                  aria-hidden="true"
                />
                <span>{getFactionName(Number(dataKey.replace("race_", "")))}</span>
              </span>
              <span className="text-neutral-300">
                {formatCount(actual)} picks ({percent}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function StatsRacePickrateChart() {
  const factions = useMemo(() => allFactions(), []);
  const [weeks, setWeeks] = useState<number>(12);
  const [reloadKey, setReloadKey] = useState(0);
  const [state, setState] = useState<LoadingState>({
    loading: true,
    error: null,
    data: null,
  });

  useEffect(() => {
    const controller = new AbortController();

    const load = async () => {
      setState(prev => ({ ...prev, loading: true, error: null }));
      try {
        const res = await fetch(`/api/stats/races?weeks=${weeks}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          let reason = "Failed to load race pick rates.";
          try {
            const payload = (await res.json()) as Partial<RacePickrateResponse>;
            if (payload?.reason) {
              reason = `Request failed (${payload.reason}).`;
            }
          } catch {
            // ignore
          }
          throw new Error(reason);
        }

        const payload = (await res.json()) as RacePickrateResponse;
        setState({
          loading: false,
          error: null,
          data: payload,
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        const message = extractErrorMessage(
          error,
          "Unable to load race pick rates at the moment.",
        );
        setState({
          loading: false,
          error: message,
          data: null,
        });
      }
    };

    load();

    return () => controller.abort();
  }, [weeks, reloadKey]);

  const chartData: ChartDatum[] = useMemo(() => {
    if (!state.data?.rows?.length) return [];
    return state.data.rows.map(row => {
      const entry: ChartDatum = {
        weekStart: row.weekStart,
        weekLabel: formatWeek(row.weekStart),
        totalMatches: row.totalMatches ?? 0,
      };
      for (const faction of factions) {
        const key = `race_${faction.raceId}` as const;
        entry[key] = row.factionCounts?.[String(faction.raceId)] ?? 0;
      }
      return entry;
    });
  }, [state.data, factions]);

  const effectiveWeeks = state.data?.weeks ?? weeks;

  return (
    <StatsCard
      title="Race pick share"
      description={`Share of races picked in ranked 1v1 matches over the last ${effectiveWeeks} weeks.`}
      actions={
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">Window</span>
          <select
            value={weeks}
            onChange={event => setWeeks(Number(event.target.value))}
            className="rounded-md border border-neutral-700/80 bg-neutral-900/80 px-2 py-1 text-sm text-white focus:border-neutral-400 focus:outline-none"
          >
            {WEEKS_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option} weeks
              </option>
            ))}
          </select>
        </label>
      }
    >
      {state.loading && !chartData.length ? (
        <div className="h-[360px] animate-pulse rounded-xl border border-neutral-800/70 bg-neutral-900/50" />
      ) : state.error ? (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-5 text-sm text-rose-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{state.error}</span>
            <button
              type="button"
              onClick={() => setReloadKey(key => key + 1)}
              className="rounded-md border border-rose-300/40 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-rose-50 hover:border-rose-200 hover:text-white"
            >
              Retry
            </button>
          </div>
        </div>
      ) : !chartData.length ? (
        <div className="rounded-xl border border-neutral-800/70 bg-neutral-900/60 p-5 text-sm text-neutral-300">
          Not enough ranked activity to chart faction picks for this window.
        </div>
      ) : (
        <div className="h-[360px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} stackOffset="expand" margin={{ top: 10, right: 10, left: -10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,120,120,0.2)" />
              <XAxis
                dataKey="weekLabel"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#a3a3a3", fontSize: 12 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickFormatter={value => `${Math.round(Number(value) * 100)}%`}
                tick={{ fill: "#a3a3a3", fontSize: 12 }}
                width={40}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend
                verticalAlign="top"
                height={32}
                wrapperStyle={{ color: "#d4d4d4", fontSize: 12 }}
              />
              {factions.map(faction => (
                <Bar
                  key={faction.raceId}
                  dataKey={`race_${faction.raceId}`}
                  name={faction.name}
                  stackId="picks"
                  fill={getFactionHexColor(faction.raceId)}
                  radius={[4, 4, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </StatsCard>
  );
}
