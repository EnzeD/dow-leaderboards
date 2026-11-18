"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Metrics = {
  sessions: number;
  pageViews: number;
  bounceRate: number | null;
};

type BreakdownRow = { label: string; sessions: number };
type BreakdownKey = "pages" | "sections" | "hostnames" | "features" | "referrers" | "campaigns" |
  "countries" | "devices" | "browsers" | "operatingSystems";

export type AnalyticsOverview = {
  totals: { current: Metrics; previous: Metrics };
  daily: (Metrics & { day: string })[];
  breakdowns: Partial<Record<BreakdownKey, BreakdownRow[]>>;
  countryCoverage: number;
};

const metrics = [
  { key: "sessions", label: "Sessions", detail: "Browser sessions with a tracked page view", color: "#fbbf24" },
  { key: "pageViews", label: "Page views", detail: "Tracked pages and site sections", color: "#5eead4" },
  { key: "bounceRate", label: "Bounce rate", detail: "One view and no feature interaction", color: "#c4b5fd" },
] as const;

const integer = new Intl.NumberFormat("en");
const percent = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });
const dayLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const countryLabel = new Intl.DisplayNames(["en"], { type: "region" });
const featureLabels: Record<string, string> = {
  leaderboard_interaction: "Leaderboards",
  search_interaction: "Search",
  replay_interaction: "Replays",
  favorite_interaction: "Favorites",
  stats_interaction: "Stats",
  profile_viewed: "Player profiles",
  account_interaction: "Accounts",
};

const formatDay = (day: string) => dayLabel.format(new Date(day));

function formatMetric(key: keyof Metrics, value: number | null) {
  if (value === null) return "—";
  return key === "bounceRate" ? `${percent.format(value)}%` : integer.format(value);
}

function PeriodChange({ metric, current, previous }: {
  metric: keyof Metrics;
  current: number | null;
  previous: number | null;
}) {
  if (current === null || previous === null || (metric !== "bounceRate" && previous === 0)) {
    return <span className="text-sm text-neutral-400">No comparison</span>;
  }

  const difference = metric === "bounceRate" ? current - previous : (current - previous) / previous * 100;
  const rounded = Math.round(difference * 10) / 10;
  const sign = rounded > 0 ? "+" : rounded < 0 ? "−" : "";
  const improved = metric === "bounceRate" ? rounded < 0 : rounded > 0;
  const color = rounded === 0 ? "text-neutral-400" : improved ? "text-emerald-300" : "text-rose-300";

  return (
    <span className={`text-sm tabular-nums ${color}`}>
      {sign}{percent.format(Math.abs(rounded))}{metric === "bounceRate" ? " pp" : "%"}
    </span>
  );
}

const formatBreakdownLabel = (key: BreakdownKey, label: string) => {
  if (key === "countries") return countryLabel.of(label) ?? label;
  if (key === "sections") return label[0].toUpperCase() + label.slice(1);
  if (key === "features") return featureLabels[label] ?? label;
  if (key !== "campaigns") return label;
  try {
    return decodeURIComponent(label.replace(/\+/g, " "));
  } catch {
    return label;
  }
};

type BreakdownTab = { key: BreakdownKey; label: string };

function Breakdown({ title, tabs, breakdowns, countryCoverage, totalSessions }: {
  title: string;
  tabs: readonly BreakdownTab[];
  breakdowns: AnalyticsOverview["breakdowns"];
  countryCoverage: number;
  totalSessions: number;
}) {
  const [key, setKey] = useState(tabs[0].key);
  const rows = breakdowns[key] ?? [];
  const max = rows[0]?.sessions ?? 1;
  const showShare = key === "devices" || key === "browsers" || key === "operatingSystems" || key === "countries";
  const denominator = key === "countries" ? countryCoverage : totalSessions;

  return (
    <section className="min-w-0 rounded-2xl border border-white/10 bg-neutral-900/95 p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral-100">{title}</h2>
        <span className="text-sm text-neutral-400">{showShare ? "Share" : key === "features" ? "Events" : "Sessions"}</span>
      </div>
      {tabs.length > 1 && (
        <div aria-label={title} role="group" className="mb-4 flex flex-wrap gap-1.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              aria-pressed={key === tab.key}
              onClick={() => setKey(tab.key)}
              className={`rounded-full px-3 py-1 text-sm transition focus-visible:outline focus-visible:outline-amber-400 ${key === tab.key ? "bg-amber-400/15 text-amber-200" : "text-neutral-400 hover:bg-white/5 hover:text-neutral-100"}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      {rows.length ? (
        <ul className="space-y-1.5">
          {rows.map((row) => (
            <li key={row.label} className="relative isolate flex min-h-9 items-center justify-between gap-4 rounded-md px-2.5 py-1.5 text-sm">
              <div aria-hidden="true" className="absolute inset-y-0 left-0 -z-10 rounded-md bg-white/[0.06]" style={{ width: `${row.sessions / max * 100}%` }} />
              <span className="min-w-0 break-words text-neutral-200">{formatBreakdownLabel(key, row.label)}</span>
              <span className="shrink-0 font-medium tabular-nums text-neutral-100" title={`${integer.format(row.sessions)} ${key === "features" ? "events" : "sessions"}`}>
                {showShare && denominator > 0 ? `${percent.format(100 * row.sessions / denominator)}%` : integer.format(row.sessions)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-400">
          {key === "countries" ? "No country data for this period. Coverage starts when local geolocation is enabled." : "No data for this period."}
        </p>
      )}
      {key === "countries" && countryCoverage > 0 && (
        <p className="mt-3 text-sm text-neutral-400">
          {integer.format(countryCoverage)} of {integer.format(totalSessions)} sessions located.{" "}
          <a href="https://db-ip.com/" className="underline decoration-white/30 underline-offset-4">IP geolocation by DB-IP</a>
        </p>
      )}
    </section>
  );
}

export default function AnalyticsDashboard({ data }: { data: AnalyticsOverview }) {
  const [metricKey, setMetricKey] = useState<keyof Metrics>("sessions");
  const metric = metrics.find(({ key }) => key === metricKey) ?? metrics[0];
  const panelData = {
    breakdowns: data.breakdowns,
    countryCoverage: data.countryCoverage,
    totalSessions: data.totals.current.sessions,
  };

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-neutral-900/95">
        <div role="group" aria-label="Chart metric" className="grid gap-px border-b border-white/10 bg-white/10 sm:grid-cols-3">
          {metrics.map(({ key, label, detail, color }) => (
            <button
              key={key}
              type="button"
              aria-pressed={metric.key === key}
              onClick={() => setMetricKey(key)}
              className={`border-l-2 bg-neutral-900 px-5 py-4 text-left transition hover:bg-neutral-800 focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-amber-400 sm:border-b-2 sm:border-l-0 ${metric.key === key ? "" : "border-transparent"}`}
              style={metric.key === key ? { borderColor: color } : undefined}
            >
              <span className="block text-sm font-medium text-neutral-300">{label}</span>
              <span className="my-1 flex flex-wrap items-baseline gap-3">
                <span className="text-3xl font-semibold tabular-nums text-white">{formatMetric(key, data.totals.current[key])}</span>
                <PeriodChange metric={key} current={data.totals.current[key]} previous={data.totals.previous[key]} />
              </span>
              <span className="block text-sm text-neutral-400">{detail}</span>
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-6">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold text-neutral-100">{metric.label} by day</h2>
            <p className="text-sm text-neutral-400">UTC · Today is in progress</p>
          </div>
          <div className="h-64 w-full sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.daily} margin={{ top: 4, right: 12, bottom: 3, left: -5 }}>
                <defs>
                  <linearGradient id="analytics-area" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={metric.color} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={metric.color} stopOpacity={0.025} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#333331" />
                <XAxis dataKey="day" tickFormatter={formatDay} stroke="#a3a3a3" tickLine={false} axisLine={false} fontSize={12} minTickGap={24} />
                <YAxis
                  domain={metric.key === "bounceRate" ? [0, 100] : [0, "auto"]}
                  tickFormatter={(value: number) => formatMetric(metric.key, value)}
                  stroke="#a3a3a3" tickLine={false} axisLine={false} width={48} fontSize={12} allowDecimals={false}
                />
                <Tooltip
                  formatter={(value) => [formatMetric(metric.key, Number(value)), metric.label]}
                  labelFormatter={(day) => formatDay(String(day))}
                  contentStyle={{ background: "#171717", border: "1px solid #404040", borderRadius: 10 }}
                  labelStyle={{ color: "#e5e5e5" }}
                />
                <Area dataKey={metric.key} type="linear" fill="url(#analytics-area)" stroke={metric.color} strokeWidth={2} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-3 text-sm text-neutral-400">Change versus the preceding period at the same UTC time.</p>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown title="Content" tabs={[{ key: "pages", label: "Pages" }, { key: "sections", label: "Sections" }, { key: "hostnames", label: "Hostnames" }, { key: "features", label: "Interactions" }]} {...panelData} />
        <Breakdown title="Traffic sources" tabs={[{ key: "referrers", label: "Referrers" }, { key: "campaigns", label: "UTM campaigns" }]} {...panelData} />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Breakdown title="Countries" tabs={[{ key: "countries", label: "Countries" }]} {...panelData} />
        <Breakdown title="Technology" tabs={[{ key: "devices", label: "Devices" }, { key: "browsers", label: "Browsers" }]} {...panelData} />
        <Breakdown title="Operating systems" tabs={[{ key: "operatingSystems", label: "Operating systems" }]} {...panelData} />
      </div>
    </div>
  );
}
