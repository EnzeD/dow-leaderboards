"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdvancedStatsContext, useAdvancedStatsContext } from "./AdvancedStatsContext";
import { useAdvancedStatsActivation } from "@/hooks/useAdvancedStatsActivation";
import { Leaderboard } from "@/lib/relic";
import { useCombinedLeaderboards } from "../useCombinedLeaderboards";
import EloHistoryCard from "./EloHistoryCard";
import MatchupMatrixCard from "./MatchupMatrixCard";
import MapPerformanceCard from "./MapPerformanceCard";
import FrequentOpponentsCard, { MatchScope } from "./FrequentOpponentsCard";
import ProfileOverviewCard, { ProfileOverview } from "./ProfileOverviewCard";
import ProBadge from "@/components/ProBadge";

type LockedCtaState = {
  label?: string;
  description?: string;
  loading?: boolean;
};

export type AdvancedStatsPanelProps = {
  profileId?: string | number | null;
  alias?: string | null;
  activatedOverride?: boolean;
  onRequestAccess?: () => void;
  ctaState?: LockedCtaState;
  variant?: "standalone" | "embedded";
  onPlayerNavigate?: (alias: string, profileId?: string) => void;
  onNavigateToPro?: () => void;
};

type AdvancedStatsSection = "elo" | "matchups" | "maps" | "opponents";

const SECTIONS: Array<{ id: AdvancedStatsSection; label: string }> = [
  { id: "elo", label: "Elo history" },
  { id: "matchups", label: "Matchups" },
  { id: "maps", label: "Maps" },
  { id: "opponents", label: "Opponents" },
];

const NEW_SUBSCRIBER_WINDOW_MS = 21 * 24 * 60 * 60 * 1000;

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
    mainRace?: string | null;
    mainRacePercentage?: number | null;
  };
  reason?: string;
};

export default function AdvancedStatsPanel({
  profileId,
  alias,
  activatedOverride,
  onRequestAccess,
  ctaState,
  variant = "standalone",
  onPlayerNavigate,
  onNavigateToPro,
}: AdvancedStatsPanelProps) {
  const activation = useAdvancedStatsActivation(profileId);
  const leaderboards = useCombinedLeaderboards();

  const activated = activation.activated || Boolean(activatedOverride);

  const isNewSubscriber = useMemo(() => {
    if (!activation.currentPeriodStart) return false;
    const parsed = Date.parse(activation.currentPeriodStart);
    if (Number.isNaN(parsed)) return false;
    return Date.now() - parsed < NEW_SUBSCRIBER_WINDOW_MS;
  }, [activation.currentPeriodStart]);

  const contextValue = useMemo(() => ({
    ...activation,
    ready: Boolean(profileId) && activated,
  }), [activation, activated, profileId]);

  const profileIdStr = useMemo(() => {
    if (profileId === undefined || profileId === null) return null;
    const cast = String(profileId).trim();
    return cast.length > 0 ? cast : null;
  }, [profileId]);

  const [windowDays, setWindowDays] = useState<number>(90);
  const [activeSection, setActiveSection] = useState<AdvancedStatsSection>("elo");
  const [overview, setOverview] = useState<ProfileOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [opponentsMatchScope, setOpponentsMatchScope] = useState<MatchScope>("all");

  useEffect(() => {
    setActiveSection("elo");
    setOpponentsMatchScope("all");
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
            mainRace: payload.totals.mainRace ?? null,
            mainRacePercentage: payload.totals.mainRacePercentage ?? null,
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

  const handleActivateClick = useCallback(() => {
    if (onRequestAccess) {
      onRequestAccess();
      return;
    }
    contextValue.refresh();
  }, [contextValue, onRequestAccess]);

  if (!profileIdStr) {
    return null;
  }

  const locked = Boolean(profileIdStr) && !activated;

  const containerClass = variant === "embedded"
    ? "rounded-xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-lg space-y-4"
    : "space-y-6";

  const titleClass = variant === "embedded" ? "text-lg font-semibold text-white" : "text-2xl font-semibold text-white";
  const descriptionClass = variant === "embedded" ? "text-xs text-neutral-400" : "text-sm text-neutral-400 mt-1";

  const displayName = alias || (profileIdStr ?? "this profile");

  const intro = (
    <div>
      <p className="text-xs uppercase tracking-wide text-yellow-400 inline-flex items-baseline gap-1.5">
        Advanced Statistics <ProBadge size="xs" clickable={Boolean(onNavigateToPro)} onNavigateToPro={onNavigateToPro} />
      </p>
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
    </div>
  );

  if (locked) {
    return (
      <AdvancedStatsContext.Provider value={contextValue}>
        <LockedAdvancedStatsPreview
          onActivate={handleActivateClick}
          loading={contextValue.loading}
          displayName={displayName}
          reason={activation.reason}
          ctaLabel={ctaState?.label}
          ctaDescription={ctaState?.description}
          ctaLoading={ctaState?.loading}
          onNavigateToPro={onNavigateToPro}
        />
      </AdvancedStatsContext.Provider>
    );
  }

  const sectionNav = (
    <div className="flex flex-wrap gap-2">
      {SECTIONS.map(({ id, label }) => {
        const active = activeSection === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActiveSection(id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition ${active
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
            leaderboardId={null}
          />
        );
      case "matchups":
        return (
          <MatchupMatrixCard
            profileId={profileIdStr}
            windowDays={windowDays}
            matchTypeId={null}
            onPlayerNavigate={onPlayerNavigate}
          />
        );
      case "maps":
        return (
          <MapPerformanceCard
            profileId={profileIdStr}
            windowDays={windowDays}
            matchTypeId={null}
            onPlayerNavigate={onPlayerNavigate}
          />
        );
      case "opponents":
      default:
        return (
          <FrequentOpponentsCard
            profileId={profileIdStr}
            windowDays={windowDays}
            matchScope={opponentsMatchScope}
            onMatchScopeChange={setOpponentsMatchScope}
            onPlayerNavigate={onPlayerNavigate}
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

        {activated && isNewSubscriber && (
          <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
            Our daily match bot is now active for your account. Give it a few weeks to crawl fresh games and these advanced statistics will improve drastically.
          </div>
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

const VALUE_POINTS = [
  "A dedicated bot to crawl your matches every day",
  "Elo ratings tracked over time",
  "Win rate broken down by faction match-up",
  "Map-by-map performance with recent form",
  "Head-to-head records against frequent opponents",
  "Unlimited match history (from activation onward)",
  "Support Dow: DE and help us improve the site",
];

const LOCKED_SECTION_DESCRIPTIONS: Record<AdvancedStatsSection, string> = {
  elo: "See rating and rank trends for every leaderboard you compete in.",
  matchups: "Spot your strongest and weakest faction match-ups instantly.",
  maps: "Plan your vetoes with map-specific win rates and recency insights.",
  opponents: "Study frequent rivals with rich head-to-head records.",
};

type LockedAdvancedStatsPreviewProps = {
  onActivate: () => void;
  loading: boolean;
  displayName: string;
  reason?: string;
  ctaLabel?: string;
  ctaDescription?: string;
  ctaLoading?: boolean;
  onNavigateToPro?: () => void;
};

function LockedAdvancedStatsPreview({
  onActivate,
  loading,
  displayName,
  reason,
  ctaLabel,
  ctaDescription,
  ctaLoading,
  onNavigateToPro,
}: LockedAdvancedStatsPreviewProps) {
  const [activeSection, setActiveSection] = useState<AdvancedStatsSection>("elo");
  const effectiveLoading = loading || Boolean(ctaLoading);
  const defaultLabel =
    reason === "not_authenticated"
      ? "Sign in to continue"
      : "Discover what's in Pro";
  const buttonLabel = effectiveLoading
    ? "Opening..."
    : ctaLabel ?? defaultLabel;
  const reasonMessage = (() => {
    switch (reason) {
      case "profile_not_linked":
        return (
          <span className="inline-flex items-center gap-1 flex-wrap">
            Link your Dawn of War profile on the account page to enable <ProBadge size="xs" clickable={false} /> insights.
          </span>
        );
      case "profile_mismatch":
        return (
          <span className="inline-flex items-center gap-1 flex-wrap">
            You can only view <ProBadge size="xs" clickable={false} /> analytics for your own linked profile.
          </span>
        );
      case "not_subscribed":
        return (
          <span className="inline-flex items-center gap-1 flex-wrap">
            <ProBadge size="xs" clickable={false} /> analytics require an active membership. Start your free one-week trial.
          </span>
        );
      case "supabase_unavailable":
        return (
          <span className="inline-flex items-center gap-1 flex-wrap">
            <ProBadge size="xs" clickable={false} /> analytics are temporarily unavailable. Please try again shortly.
          </span>
        );
      default:
        return null;
    }
  })();
  const secondaryCopy = ctaDescription ?? null;

  return (
    <div className="space-y-6 rounded-xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-lg">
      <header className="rounded-xl border border-yellow-500/25 bg-neutral-900/80 p-4 shadow-lg">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-1 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-yellow-500/40 bg-yellow-500/15 text-yellow-300">
              <svg
                className="h-5 w-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20h16" />
                <rect x="6" y="12" width="2.5" height="8" rx="0.6" fill="currentColor" stroke="none" />
                <rect x="11" y="8" width="2.5" height="12" rx="0.6" fill="currentColor" stroke="none" />
                <rect x="16" y="4" width="2.5" height="16" rx="0.6" fill="currentColor" stroke="none" />
              </svg>
            </span>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-white">
                <span className="inline-flex items-baseline gap-1.5">
                  Advanced Statistics <ProBadge size="sm" clickable={Boolean(onNavigateToPro)} onNavigateToPro={onNavigateToPro} />
                </span>
              </p>
              <p className="text-xs text-neutral-300">
                Detailed insights for {displayName} across ratings, matchups, maps, and opponents.
              </p>
              {reasonMessage && (
                <p className="text-xs text-amber-300">
                  {reasonMessage}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 flex-col text-xs text-neutral-400 sm:text-right">
            <span className="uppercase tracking-wide text-yellow-300 inline-flex items-center justify-end gap-1.5">
              Built for Dawn of War
            </span>
            <span>Everything you need to climb.</span>
          </div>
        </div>
      </header>
      <section className="rounded-2xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-lg">
        <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-neutral-400 inline-flex items-center gap-2">
          Why go <ProBadge size="xs" clickable={false} />
        </h3>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {VALUE_POINTS.map((point, index) => (
            <li key={point} className="flex items-start gap-3 text-sm text-neutral-200">
              <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-yellow-400/20 text-yellow-300">
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3.5 8.5l2.5 2.5 6-6" />
                </svg>
              </span>
              <span>
                {index === 0 ? (
                  <>
                    <span className="underline decoration-yellow-400/50">A dedicated bot</span> to crawl your matches every day
                  </>
                ) : (
                  point
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <AdvancedStatsGeneralInfo />

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map(({ id, label }) => {
            const active = activeSection === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSection(id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition ${active
                  ? "bg-yellow-500/20 text-yellow-200 border-yellow-500/40 shadow"
                  : "bg-neutral-900/60 text-neutral-300 border-neutral-700/60 hover:bg-neutral-800/60 hover:text-white"
                  }`}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-neutral-700/40 bg-neutral-900/70 p-6 shadow-xl">
          <div className="pointer-events-none select-none opacity-70 blur-sm">
            <div className="h-48 rounded-xl border border-neutral-700/40 bg-neutral-800/40">
              <div className="h-full w-full bg-gradient-to-br from-neutral-800/60 via-neutral-900/40 to-neutral-800/30" />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-16 rounded-lg border border-neutral-700/40 bg-neutral-800/40" />
              ))}
            </div>
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-neutral-950/70 px-6 text-center">
            <p className="text-sm text-neutral-200">
              {LOCKED_SECTION_DESCRIPTIONS[activeSection]}
            </p>
            {secondaryCopy && (
              <p className="text-xs text-neutral-400">
                {secondaryCopy}
              </p>
            )}
            <button
              type="button"
              onClick={onNavigateToPro || onActivate}
              disabled={effectiveLoading}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-400/60 bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-amber-300 disabled:opacity-70"
            >
              {buttonLabel}
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}

type LockedStatCardProps = {
  title: string;
  subtitle: string;
};

const AdvancedStatsGeneralInfo = () => (
  <section className="space-y-3">
    <h4 className="text-sm font-semibold uppercase tracking-[0.25em] text-neutral-400">General information</h4>
    <div className="grid gap-3 sm:grid-cols-3">
      <LockedStatCard title="Matches in database" subtitle="+182 in the last 7 days" />
      <LockedStatCard title="Leaderboard record" subtitle="Total 1,248 · Win rate 62.4%" />
      <LockedStatCard title="Main race" subtitle="58% of matches" />
    </div>
  </section>
);

const LockedStatCard = ({ title, subtitle }: LockedStatCardProps) => (
  <div className="relative overflow-hidden rounded-lg border border-neutral-700/40 bg-neutral-900/70 p-4">
    <div className="absolute inset-0 bg-neutral-950/50 backdrop-blur-sm" aria-hidden />
    <div className="relative space-y-2 text-neutral-300">
      <p className="text-xs uppercase tracking-wide text-neutral-400">{title}</p>
      <p className="text-xl font-semibold text-white blur-sm select-none">1,248</p>
      <p className="text-xs text-neutral-400 blur-sm select-none">{subtitle}</p>
    </div>
  </div>
);

export const AdvancedStatsCollapsedPreview = ({ displayName, onNavigateToPro }: { displayName: string; onNavigateToPro?: () => void }) => (
  <div className="space-y-4 rounded-xl border border-neutral-700/40 bg-neutral-900/70 p-4 shadow-lg">
    <header className="rounded-xl border border-yellow-500/25 bg-neutral-900/80 p-4 shadow-lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-1 items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-yellow-500/40 bg-yellow-500/15 text-yellow-300">
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 20h16" />
              <rect x="6" y="12" width="2.5" height="8" rx="0.6" fill="currentColor" stroke="none" />
              <rect x="11" y="8" width="2.5" height="12" rx="0.6" fill="currentColor" stroke="none" />
              <rect x="16" y="4" width="2.5" height="16" rx="0.6" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-white">
              <span className="inline-flex items-baseline gap-1.5">
                Advanced Statistics <ProBadge size="sm" clickable={Boolean(onNavigateToPro)} onNavigateToPro={onNavigateToPro} />
              </span>
            </p>
            <p className="text-xs text-neutral-300">
              Detailed insights for {displayName} across ratings, matchups, maps, and opponents.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col text-xs text-neutral-400 sm:text-right">
          <span className="uppercase tracking-wide text-yellow-300">Built for Dawn of War</span>
          <span>Everything you need to climb.</span>
        </div>
      </div>
    </header>
    <AdvancedStatsGeneralInfo />
  </div>
);
