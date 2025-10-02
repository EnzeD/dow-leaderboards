"use client";

/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, Fragment } from "react";
import Link from "next/link";
import SupportButton from "@/app/_components/SupportButton";
import SupportTabKoFiButton from "@/app/_components/SupportTabKoFiButton";
import ReplaysTab from "@/app/_components/ReplaysTab";
import AdvancedStatsPanel from "@/app/_components/premium/AdvancedStatsPanel";
import AutocompleteSearch from "@/components/AutocompleteSearch";
import { LadderRow, Leaderboard } from "@/lib/relic";
import { PlayerSearchResult, supabase } from "@/lib/supabase";
import { getMapName, getMapImage } from "@/lib/mapMetadata";
import { getLevelFromXP } from "@/lib/xp-levels";
import { cachedFetch, clearAllCache } from "@/lib/cached-fetch";
// Faction icons (bundled assets). If you move icons to public/assets/factions,
// you can reference them via URL instead.
import chaosIcon from "../../assets/factions/chaos.png";
import darkEldarIcon from "../../assets/factions/darkeldar.png";
import eldarIcon from "../../assets/factions/eldar.png";
import imperialGuardIcon from "../../assets/factions/imperialguard.png";
import necronIcon from "../../assets/factions/necron.png";
import orkIcon from "../../assets/factions/ork.png";
import sistersIcon from "../../assets/factions/sister.png";
import spaceMarineIcon from "../../assets/factions/spacemarine.png";
import tauIcon from "../../assets/factions/tau.png";
import type { StaticImageData } from 'next/image';

type LadderData = {
  leaderboardId: number;
  lastUpdated: string;
  stale: boolean;
  rows: LadderRow[];
};

type RosterEntry = {
  key: string;
  label: string;
  faction: string;
  rating?: number;
  onClick?: () => void;
};

type FavoriteEntry = {
  key: string;
  profileId?: string;
  alias: string;
  playerName?: string;
  country?: string;
};

type FavoriteDataEntry = {
  result: any | null;
  fetchedAt: number;
  error?: string;
};

const DEFAULT_RECENT_MATCH_LIMIT = 10;
const FAVORITES_COOKIE = 'dow_favorites';
const FAVORITES_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
const premiumTeaserEnabled = ['1', 'true', 'on', 'yes'].includes(
  (process.env.NEXT_PUBLIC_ENABLE_PREMIUM_TEASER ?? '').toLowerCase()
);
const PREMIUM_PRICE_OPTIONS = ['No', '$2.99/month', '$4.99/month'] as const;
type PremiumSurveyChoice = (typeof PREMIUM_PRICE_OPTIONS)[number];
const PREMIUM_PRICE_DETAIL: Record<PremiumSurveyChoice, string | null> = {
  'No': null,
  '$2.99/month': 'Support your crawling jobs and bots.',
  '$4.99/month': 'Support the website as well.',
};

const normalizeAlias = (alias?: string | null): string => (alias ?? '').trim();

const buildFavoriteKey = (
  profileId?: string | number | null,
  alias?: string | null,
  fallback?: string
): string | null => {
  if (profileId !== undefined && profileId !== null) {
    const pid = String(profileId).trim();
    if (pid) return `pid:${pid}`;
  }
  const normAlias = normalizeAlias(alias);
  if (normAlias) return `alias:${normAlias.toLowerCase()}`;
  if (fallback) return `fallback:${fallback}`;
  return null;
};

const regionDisplayNames = typeof Intl !== 'undefined' && 'DisplayNames' in Intl
  ? new Intl.DisplayNames(['en'], { type: 'region' })
  : undefined;

const normalizeCountryCode = (countryCode?: string): string | undefined => {
  if (!countryCode) return undefined;
  const trimmed = countryCode.trim().toLowerCase();
  if (!trimmed) return undefined;
  if (trimmed === 'uk') return 'gb';
  return trimmed;
};

const getCountryName = (countryCode?: string): string | null => {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return null;
  const upper = normalized.toUpperCase();
  try {
    return regionDisplayNames?.of(upper) || upper;
  } catch {
    return upper;
  }
};

const FlagIcon = ({ countryCode, compact = false }: { countryCode: string; compact?: boolean }) => {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return null;
  const isoCode = normalized.toUpperCase();
  const label = getCountryName(countryCode) || isoCode;
  const flagHeight = compact ? '0.7rem' : '0.9rem';
  const flagWidth = `calc(${flagHeight} * 4 / 3)`;

  return (
    <span
      className={`inline-flex items-center ${compact ? 'gap-1 px-1.5 py-0.5' : 'gap-1.5 px-2 py-1'} bg-neutral-700/80 rounded-md border border-neutral-600/50 shadow-sm backdrop-blur-sm`}
      title={label}
    >
      <span
        className={`fi fi-${normalized}`}
        aria-hidden="true"
        style={{
          width: flagWidth,
          minWidth: flagWidth,
          height: flagHeight,
          boxShadow: '0 0 0 1px rgba(0,0,0,0.35)',
          borderRadius: '0.25rem'
        }}
      />
      <span className={`uppercase tracking-wide font-mono font-semibold text-neutral-200 ${compact ? 'text-[0.6rem]' : 'text-[0.7rem]'}`}>
        {isoCode}
      </span>
    </span>
  );
};

// Format last match date
const formatLastMatch = (dateInput?: Date | string): string => {
  if (!dateInput) return "Never";

  let date: Date;
  if (typeof dateInput === 'string') {
    date = new Date(dateInput);
  } else {
    date = dateInput;
  }

  if (!(date instanceof Date) || isNaN(date.getTime())) return "Never";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays} days ago`;
  if (diffHours > 0) return `${diffHours} hours ago`;
  if (diffMinutes > 0) return `${diffMinutes} minutes ago`;
  return "Just now";
};

const formatTimestamp = (iso?: string | null): string | null => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
};

// Get tier indicator based on rank
const getTierIndicator = (rank: number): string => {
  if (rank <= 5) return "🏆"; // Top 5
  if (rank <= 10) return "🥇"; // Top 10
  if (rank <= 25) return "🥈"; // Top 25
  if (rank <= 50) return "🥉"; // Top 50
  return "⚡"; // Everyone else
};

// Get faction-specific colors
const getFactionColor = (faction: string): string => {
  const factionColors: Record<string, string> = {
    'Chaos': 'text-red-400',
    'Dark Eldar': 'text-purple-400',
    'Eldar': 'text-blue-400',
    'Imperial Guard': 'text-yellow-400',
    'Necrons': 'text-emerald-300',
    'Orks': 'text-green-400',
    'Sisters of Battle': 'text-pink-400',
    'Space Marines': 'text-blue-300',
    'Tau': 'text-cyan-400'
  };
  return factionColors[faction] || 'text-orange-300';
};

// Map faction → icon path (bundled)
const FACTION_ICON_MAP: Record<string, StaticImageData | string> = {
  'Chaos': chaosIcon,
  'Dark Eldar': darkEldarIcon,
  'Eldar': eldarIcon,
  'Imperial Guard': imperialGuardIcon,
  'Necrons': necronIcon,
  'Orks': orkIcon,
  'Sisters of Battle': sistersIcon,
  'Space Marines': spaceMarineIcon,
  'Tau': tauIcon,
};

const FactionLogo = ({ faction, size = 16, className = '', yOffset }: { faction?: string; size?: number; className?: string; yOffset?: number }) => {
  const icon = faction ? FACTION_ICON_MAP[faction] : undefined;
  if (!icon) return null;
  const url = typeof icon === 'string' ? icon : (icon as any).src || '';
  const dim = `${size}px`;
  // Small vertical tweak to better align optically with text baselines
  const offset = typeof yOffset === 'number' ? yOffset : Math.max(1, Math.round(size * 0.06));
  return (
    <span
      aria-hidden
      className={`inline-block align-middle ${className}`}
      style={{
        width: dim,
        height: dim,
        backgroundColor: 'currentColor',
        WebkitMaskImage: `url(${url})`,
        maskImage: `url(${url})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        display: 'inline-block',
        position: 'relative',
        top: `${offset}px`,
      }}
    />
  );
};

type RankDeltaVariant = "up" | "down" | "new" | "same";

const RANK_DELTA_VARIANT_CLASS: Record<RankDeltaVariant, string> = {
  up: "text-green-300 bg-green-900/40 border border-green-500/30",
  down: "text-red-300 bg-red-900/40 border border-red-500/30",
  new: "text-sky-300 bg-sky-900/40 border border-sky-500/30",
  same: "text-neutral-200 bg-neutral-800/70 border border-neutral-600/40",
};

type RankDeltaMeta = { text: string | React.ReactNode; title: string; variant: RankDeltaVariant };

const resolveRankDeltaMeta = (delta?: number | null, allowNew = true): RankDeltaMeta | null => {
  if (delta === null || delta === undefined) {
    if (!allowNew) return null;
    return { text: "NEW", title: "New entry", variant: "new" };
  }

  if (delta === 0) {
    return {
      text: "=",
      title: "No rank change",
      variant: "same",
    };
  }

  const magnitude = Math.abs(Math.round(delta));
  if (magnitude === 0) return null;

  if (delta > 0) {
    return {
      text: (
        <>
          <span className="inline-block -translate-y-0.5">↑</span>
          {magnitude}
        </>
      ),
      title: `Up ${magnitude} place${magnitude === 1 ? '' : 's'}`,
      variant: "up",
    };
  }

  return {
    text: (
      <>
        <span className="inline-block -translate-y-0.5">↓</span>
        {magnitude}
      </>
    ),
    title: `Down ${magnitude} place${magnitude === 1 ? '' : 's'}`,
    variant: "down",
  };
};

const RankDeltaBadge = ({
  delta,
  hasHistory,
  size = "md",
}: {
  delta?: number | null;
  hasHistory: boolean;
  size?: "md" | "sm";
}) => {
  const meta = resolveRankDeltaMeta(delta, hasHistory);
  if (!meta) return null;

  const sizeClasses = size === "sm"
    ? "px-1.5 py-0.5 text-[0.65rem]"
    : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-semibold tracking-tight ${sizeClasses} ${RANK_DELTA_VARIANT_CLASS[meta.variant]}`}
      title={meta.title}
      aria-label={meta.title}
    >
      {meta.text}
    </span>
  );
};

const RACE_ID_TO_FACTION: Record<number, string> = {
  0: 'Chaos',
  1: 'Dark Eldar',
  2: 'Eldar',
  3: 'Imperial Guard',
  4: 'Necrons',
  5: 'Orks',
  6: 'Sisters of Battle',
  7: 'Space Marines',
  8: 'Tau',
};

const MATCH_TYPE_LABELS: Record<number, string> = {
  1: 'Automatch 1v1',
  2: 'Automatch 2v2',
  3: 'Automatch 3v3',
  4: 'Automatch 4v4',
};

// Map raceId from match history to faction name as defined by relic API payloads
const raceIdToFaction = (raceId?: number): string => {
  if (raceId === undefined || raceId === null || raceId < 0) return 'Unknown';
  return RACE_ID_TO_FACTION[raceId] || 'Unknown';
};

const formatMatchTypeLabel = (matchTypeId?: number): string => {
  if (typeof matchTypeId !== 'number') return 'Custom';
  return MATCH_TYPE_LABELS[matchTypeId] ?? 'Custom';
};

// Get rank color based on position
const getRankColor = (rank: number): string => {
  if (rank <= 5) return 'text-yellow-400'; // Gold for top 5
  if (rank <= 10) return 'text-yellow-300'; // Light gold for top 10
  if (rank <= 25) return 'text-orange-400'; // Orange for top 25
  return 'text-red-400'; // Red for others
};

// Tab types
type TabType = 'leaderboards' | 'search' | 'favorites' | 'replays' | 'support';

export default function Home() {
  type AppState = {
    view: 'leaderboards' | 'search' | 'favorites' | 'replays' | 'support';
    searchQuery?: string;
    searchProfileId?: string;
    selectedFaction?: string;
    selectedMatchType?: string;
    selectedCountry?: string;
    selectedId?: number;
    combinedViewMode?: 'best' | 'all';
  };
  
  // Build a URL string that reflects the given state via query params
  const buildUrl = (state: AppState): string => {
    if (typeof window === 'undefined') return '';
    const url = new URL(window.location.href);
    const p = url.searchParams;
    // reset known params first
    p.delete('tab');
    p.delete('match');
    p.delete('faction');
    p.delete('country');
    p.delete('q');
    p.delete('pid');
    p.delete('combined');

    if (state.view === 'leaderboards') {
      // leaderboards is the default tab; keep root clean by omitting defaults
      if (state.selectedMatchType && state.selectedMatchType !== '1v1') {
        p.set('match', state.selectedMatchType);
      }
      if (state.selectedFaction && state.selectedFaction !== 'All factions') {
        p.set('faction', state.selectedFaction);
      }
      if (state.selectedCountry && state.selectedCountry !== 'Global') {
        p.set('country', state.selectedCountry);
      }
      const isCombined = state.selectedFaction === 'All factions' && state.selectedMatchType === '1v1';
      if (isCombined && state.combinedViewMode === 'all') {
        p.set('combined', 'all');
      }
      // no 'tab' param for default view
    } else if (state.view === 'search') {
      p.set('tab', 'search');
      if (state.searchQuery) p.set('q', state.searchQuery);
      if (state.searchProfileId) p.set('pid', state.searchProfileId);
    } else if (state.view === 'favorites') {
      p.set('tab', 'favorites');
    } else if (state.view === 'replays') {
      p.set('tab', 'replays');
    } else if (state.view === 'support') {
      p.set('tab', 'support');
    }

    const qp = p.toString();
    url.search = qp ? `?${qp}` : '';
    return url.toString();
  };

  // Replace the current history entry with a URL that matches current state
  const syncUrl = (state: AppState) => {
    try {
      if (typeof window === 'undefined') return;
      const newUrl = buildUrl(state);
      window.history.replaceState(state, '', newUrl);
    } catch {}
  };

  // Parse AppState from the current URL (query params)
  const parseStateFromUrl = (): AppState => {
    if (typeof window === 'undefined') return { view: 'leaderboards' };
    const p = new URLSearchParams(window.location.search);
    const tab = (p.get('tab') || 'leaderboards') as AppState['view'];
    if (tab === 'search') {
      const q = (p.get('q') || '').trim();
      const pid = p.get('pid');
      return {
        view: 'search',
        searchQuery: q,
        searchProfileId: pid || undefined
      };
    }
    if (tab === 'favorites') {
      return { view: 'favorites' };
    }
    if (tab === 'replays') {
      return { view: 'replays' };
    }
    if (tab === 'support') {
      return { view: 'support' };
    }
    const match = p.get('match') || '1v1';
    const faction = p.get('faction') || 'All factions';
    const country = p.get('country') || 'Global';
    const combined = p.get('combined');
    return {
      view: 'leaderboards',
      selectedMatchType: match,
      selectedFaction: faction,
      selectedCountry: country,
      combinedViewMode: combined === 'all' ? 'all' : 'best',
    };
  };
  const [activeTab, setActiveTab] = useState<TabType>('leaderboards');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [selectedId, setSelectedId] = useState<number>(1);
  const [ladderData, setLadderData] = useState<LadderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof LadderRow>("rank");
  const [sortDesc, setSortDesc] = useState(false);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [_searchProfileId, _setSearchProfileId] = useState<string | undefined>(undefined);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [steamProfiles, setSteamProfiles] = useState<Record<string, string | null>>({});
  const steamProfileFetchesInFlight = useRef<Set<string>>(new Set());
  const [searchLastUpdated, setSearchLastUpdated] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [_selectedPlayer, _setSelectedPlayer] = useState<PlayerSearchResult | null>(null);
  const [triggerAutocomplete, setTriggerAutocomplete] = useState(false);
  const [combinedLimit, setCombinedLimit] = useState<number>(200);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [combinedViewMode, setCombinedViewMode] = useState<'best' | 'all'>('best');
  const [lbExpanded, setLbExpanded] = useState(false);
  const [recentMatchLimits, setRecentMatchLimits] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<Record<string, FavoriteEntry>>({});
  const [favoriteData, setFavoriteData] = useState<Record<string, FavoriteDataEntry>>({});
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [premiumPromptContext, setPremiumPromptContext] = useState<{
    alias: string;
    profileId?: string;
    playerName?: string;
  } | null>(null);
  const [premiumPromptChoice, setPremiumPromptChoice] = useState<PremiumSurveyChoice | null>(null);
  const [premiumPromptLoading, setPremiumPromptLoading] = useState(false);
  const [premiumPromptError, setPremiumPromptError] = useState<string | null>(null);
  const [premiumPromptResponseId, setPremiumPromptResponseId] = useState<string | null>(null);
  const [premiumEmailValue, setPremiumEmailValue] = useState('');
  const [premiumEmailStatus, setPremiumEmailStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [premiumEmailError, setPremiumEmailError] = useState<string | null>(null);
  const [activeAdvancedStats, setActiveAdvancedStats] = useState<{ profileId: string; alias?: string | null } | null>(null);

  // Live Steam player count (DoW:DE) - Cached via Supabase
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [playerCountLoading, setPlayerCountLoading] = useState<boolean>(false);

  // Load favourites from cookie on mount
  useEffect(() => {
    if (typeof document === 'undefined') return;
    try {
      const cookieEntry = document.cookie.split('; ').find(row => row.startsWith(`${FAVORITES_COOKIE}=`));
      if (!cookieEntry) return;
      const rawValue = cookieEntry.substring(FAVORITES_COOKIE.length + 1);
      const decoded = decodeURIComponent(rawValue || '');
      const parsed = JSON.parse(decoded);
      if (!Array.isArray(parsed)) return;
      const map: Record<string, FavoriteEntry> = {};
      for (const item of parsed) {
        if (!item) continue;
        const aliasRaw = typeof item.alias === 'string' ? item.alias : undefined;
        const profileIdRaw = item?.profileId !== undefined && item?.profileId !== null ? String(item.profileId) : undefined;
        const key = buildFavoriteKey(profileIdRaw, aliasRaw);
        if (!key) continue;
        const alias = aliasRaw && aliasRaw.trim() ? aliasRaw.trim() : undefined;
        const playerName = typeof item.playerName === 'string' ? item.playerName : alias;
        map[key] = {
          key,
          profileId: profileIdRaw,
          alias: alias ?? (playerName ?? key),
          playerName: playerName ?? alias ?? key,
          country: typeof item.country === 'string' ? item.country : undefined,
        };
      }
      if (Object.keys(map).length > 0) {
        setFavorites(map);
      }
    } catch (error) {
      console.warn('Failed to load favourites from cookie', error);
    }
  }, []);

  // Filter states
  const [selectedFaction, setSelectedFaction] = useState<string>("All factions");
  const [selectedMatchType, setSelectedMatchType] = useState<string>("1v1");
  const [selectedCountry, setSelectedCountry] = useState<string>("Global");

  // Check if we're in combined mode (only for All factions + 1v1)
  const isCombinedMode = selectedFaction === "All factions" && selectedMatchType === "1v1";

  // Get unique factions and match types
  // Only show "All factions" for 1v1 match type
  const availableFactions = Array.from(
    new Set(
      leaderboards
        .map(lb => lb.faction)
        .filter(faction => faction && faction !== 'Unknown')
    )
  );
  const matchTypeSet = new Set(leaderboards.map(lb => lb.matchType).filter(Boolean));
  const matchTypeOrder = ['1v1', '2v2', '3v3', '4v4'];
  const matchTypes = matchTypeOrder.filter(type => matchTypeSet.has(type));
  const showFactionFilter = true;
  const factions = selectedMatchType === "1v1"
    ? ["All factions", ...availableFactions]
    : availableFactions;

  // Get unique countries from current ladder data
  const availableCountries = Array.from(new Set(
    (ladderData?.rows || [])
      .map(row => getCountryName(row.country))
      .filter((name): name is string => Boolean(name))
  )).sort((a, b) => a.localeCompare(b));
  const countries = ["Global", ...availableCountries];

  // Filter leaderboards based on selection (not used in combined mode)
  const filteredLeaderboards = leaderboards.filter(lb =>
    (!selectedMatchType || lb.matchType === selectedMatchType) &&
    (selectedFaction === "All factions" || lb.faction === selectedFaction)
  );

  const handleFactionChange = (value: string) => {
    setSelectedFaction(value);
    if (value === "All factions") return;

    const matching = leaderboards.find(lb =>
      lb.matchType === selectedMatchType && lb.faction === value
    );

    if (matching) {
      setSelectedId(matching.id);
    }
  };

  const handleClearCache = () => {
    clearAllCache();
    // Force refresh current view by reloading the page
    window.location.reload();
  };

  useEffect(() => {
    if (matchTypes.length === 0) return;
    if (!matchTypes.includes(selectedMatchType)) {
      setSelectedMatchType(matchTypes[0]);
    }
  }, [matchTypes, selectedMatchType]);

  useEffect(() => {
    if (!isCombinedMode) return;
    setLbExpanded(false);
    setCombinedLimit(200);
  }, [combinedViewMode, isCombinedMode]);

  // Load leaderboards on mount
  useEffect(() => {
    cachedFetch("/api/leaderboards", { ttl: 24 * 60 * 60 * 1000 }) // 24h cache
      .then(r => r.json())
      .then(data => {
        setLeaderboards(data.items || []);
        // Don't set selectedId here - let the filter effect handle it
      });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const entries = Object.values(favorites).map(({ profileId, alias, playerName, country }) => ({
      profileId,
      alias,
      playerName,
      country,
    }));
    if (entries.length === 0) {
      document.cookie = `${FAVORITES_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      return;
    }
    try {
      const serialized = encodeURIComponent(JSON.stringify(entries));
      document.cookie = `${FAVORITES_COOKIE}=${serialized}; path=/; max-age=${FAVORITES_COOKIE_MAX_AGE}; SameSite=Lax`;
    } catch (error) {
      console.warn('Failed to persist favourites', error);
    }
  }, [favorites]);

  useEffect(() => {
    setFavoriteData(prev => {
      const allowedKeys = new Set(Object.keys(favorites));
      let mutated = false;
      const next: typeof prev = {};
      for (const [key, value] of Object.entries(prev)) {
        if (allowedKeys.has(key)) {
          next[key] = value;
        } else {
          mutated = true;
        }
      }
      return mutated ? next : prev;
    });
  }, [favorites]);

  // Initialize from URL and handle back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 1) Apply URL params to local state on first load
    const initialFromUrl = parseStateFromUrl();
    if (initialFromUrl.view === 'search') {
      setActiveTab('search');
      if (typeof initialFromUrl.searchQuery === 'string') setSearchQuery(initialFromUrl.searchQuery);
      if (typeof initialFromUrl.searchProfileId === 'string') _setSearchProfileId(initialFromUrl.searchProfileId);
      // kick off search on first load if q is present
      if (initialFromUrl.searchQuery) {
        try {
          // If we have a profile ID, use precise search
          if (initialFromUrl.searchProfileId) {
            runSearchByName(initialFromUrl.searchQuery, initialFromUrl.searchProfileId);
          } else {
            // run without pushing history
            handlePlayerSearch(initialFromUrl.searchQuery, { pushHistory: false });
          }
        } catch {}
      }
    } else if (initialFromUrl.view === 'leaderboards') {
      setActiveTab('leaderboards');
      if (typeof initialFromUrl.selectedMatchType === 'string') setSelectedMatchType(initialFromUrl.selectedMatchType);
      if (typeof initialFromUrl.selectedFaction === 'string') setSelectedFaction(initialFromUrl.selectedFaction);
      if (typeof initialFromUrl.selectedCountry === 'string') setSelectedCountry(initialFromUrl.selectedCountry);
      if (initialFromUrl.combinedViewMode) {
        setCombinedViewMode(initialFromUrl.combinedViewMode);
      }
    } else if (initialFromUrl.view === 'favorites') {
      setActiveTab('favorites');
    } else if (initialFromUrl.view === 'replays') {
      setActiveTab('replays');
    } else if (initialFromUrl.view === 'support') {
      setActiveTab('support');
    }

    // 2) Ensure the URL matches state (normalizes missing defaults)
    const initialState: AppState = {
      view: initialFromUrl.view || activeTab,
      searchQuery: initialFromUrl.searchQuery ?? searchQuery,
      selectedFaction: initialFromUrl.selectedFaction ?? selectedFaction,
      selectedMatchType: initialFromUrl.selectedMatchType ?? selectedMatchType,
      selectedCountry: initialFromUrl.selectedCountry ?? selectedCountry,
      selectedId,
      combinedViewMode: initialFromUrl.combinedViewMode ?? combinedViewMode,
    };
    syncUrl(initialState);

    const onPopState = (_e: PopStateEvent) => {
      // Prefer URL params for source of truth
      const fromUrl = parseStateFromUrl();
      if (fromUrl.view) setActiveTab(fromUrl.view);
      if (fromUrl.view === 'search') {
        const q = (fromUrl.searchQuery || '').trim();
        setSearchQuery(q);
        setSearchResults([]);
        if (q) {
          // Re-run search without pushing history
          handlePlayerSearch(q, { pushHistory: false });
        }
      } else if (fromUrl.view === 'leaderboards') {
        if (typeof fromUrl.selectedFaction === 'string') setSelectedFaction(fromUrl.selectedFaction);
        if (typeof fromUrl.selectedMatchType === 'string') setSelectedMatchType(fromUrl.selectedMatchType);
        if (typeof fromUrl.selectedCountry === 'string') setSelectedCountry(fromUrl.selectedCountry);
        if (fromUrl.combinedViewMode) setCombinedViewMode(fromUrl.combinedViewMode);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-switch faction when match type changes
  useEffect(() => {
    if (!selectedMatchType) return;
    if (selectedMatchType === '1v1') {
      if (selectedFaction !== 'All factions' && !availableFactions.includes(selectedFaction)) {
        setSelectedFaction('All factions');
      }
      return;
    }

    // For non-1v1 modes, only switch faction if current faction is not available
    const availableFactionsForMode = Array.from(
      new Set(
        leaderboards
          .filter(lb => lb.matchType === selectedMatchType && lb.faction && lb.faction !== 'Unknown')
          .map(lb => lb.faction)
      )
    );

    if (availableFactionsForMode.length > 0 && !availableFactionsForMode.includes(selectedFaction)) {
      // Only switch if current faction is not available for this match type
      const firstAvailable = availableFactionsForMode[0];
      if (firstAvailable) {
        setSelectedFaction(firstAvailable);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMatchType, leaderboards]); // Only run when match type or leaderboards change

  // Update selected ID when filters change OR when leaderboards first load
  useEffect(() => {
    if (isCombinedMode) return;
    if (filteredLeaderboards.length === 0) return;
    const newId = filteredLeaderboards[0].id;
    if (newId !== selectedId) {
      setSelectedId(newId);
    }
  }, [filteredLeaderboards, selectedId, isCombinedMode]);

  // Load ladder when selection changes
  useEffect(() => {
    if (isCombinedMode) {
      // Fetch combined 1v1 data (client-side cached)
      setLoading(true);
      const base = combinedViewMode === 'all'
        ? '/api/cache/combined-1v1-multi'
        : '/api/cache/combined-1v1';
      cachedFetch(`${base}/${combinedLimit}`) // 5min default cache
        .then(r => r.json())
        .then(data => {
          setLadderData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      // Fetch single leaderboard data
      if (!selectedId) return;
      setLoading(true);
      cachedFetch(`/api/cache/leaderboard/${selectedId}`) // 5min default cache
        .then(r => r.json())
        .then(data => {
          setLadderData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [selectedId, isCombinedMode, combinedLimit, combinedViewMode]);

  const handleSort = (field: keyof LadderRow) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(field === "playerName" || field === "rankDelta");
    }
  };

  // Filter and sort rows
  const filteredRows = ladderData?.rows?.filter(row => {
    const matchesSearch = row.playerName.toLowerCase().includes(search.toLowerCase());
    const matchesCountry = selectedCountry === "Global" ||
      (row.country && getCountryName(row.country) === selectedCountry);
    return matchesSearch && matchesCountry;
  }) || [];

  const sortedRows = [...filteredRows].sort((a, b) => {
    let comparison = 0;

    if (sortField === "lastMatchDate") {
      // Parse dates from both Date objects and ISO strings (from JSON)
      const getTime = (date: any) => {
        if (!date) return 0;
        if (date instanceof Date) return date.getTime();
        if (typeof date === 'string') {
          const parsed = new Date(date);
          return isNaN(parsed.getTime()) ? 0 : parsed.getTime();
        }
        return 0;
      };
      const aTime = getTime(a.lastMatchDate);
      const bTime = getTime(b.lastMatchDate);
      comparison = aTime - bTime;
    } else if (sortField === "rankDelta") {
      const normalize = (value: number | null | undefined) =>
        typeof value === "number" ? value : Number.NEGATIVE_INFINITY;
      comparison = normalize(a.rankDelta) - normalize(b.rankDelta);
    } else {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (typeof aVal === "string" && typeof bVal === "string") {
        comparison = aVal.localeCompare(bVal);
      } else {
        const numA = typeof aVal === "number" ? aVal : Number(aVal ?? 0);
        const numB = typeof bVal === "number" ? bVal : Number(bVal ?? 0);
        comparison = numA - numB;
      }
    }

    return sortDesc ? -comparison : comparison;
  });

  const hasRankDeltaData = sortedRows.some(row => typeof row.rankDelta === "number");

  const selectedLeaderboard = leaderboards.find(lb => lb.id === selectedId);

  // Auto-expand search on leaderboards tab when no results are found
  useEffect(() => {
    const q = search.trim().toLowerCase();
    if (!q) { setLbExpanded(false); return; }
    if (!ladderData?.rows?.length) return;

    const hasMatch = ladderData.rows.some(r => r.playerName.toLowerCase().includes(q));
    if (hasMatch) return; // no need to expand

    // Try to expand once per search/filter combo
    if (lbExpanded) return;

    if (isCombinedMode) {
      if (combinedLimit < 1000) {
        setCombinedLimit(1000);
        setLbExpanded(true);
      }
    } else if (selectedId) {
      // Fetch extended rows for this specific leaderboard (up to 1000)
      setLbExpanded(true);
      cachedFetch(`/api/cache/leaderboard/${selectedId}/1000`) // 5min default cache
        .then(r => r.json())
        .then(data => {
          setLadderData(data);
        })
        .catch(() => {});
    }
  }, [search, ladderData, isCombinedMode, combinedLimit, selectedId, lbExpanded, combinedViewMode]);

  // Reset expansion flag when filters change or user clears search
  useEffect(() => {
    setLbExpanded(false);
  }, [selectedMatchType, selectedFaction, selectedCountry, selectedId, activeTab, combinedViewMode]);

  // When search is cleared, revert to default dataset size (top 200)
  useEffect(() => {
    const q = search.trim();
    if (q) return;
    if (isCombinedMode) {
      if (!lbExpanded) return;
      if (combinedLimit !== 200) setCombinedLimit(200);
      setLbExpanded(false);
    } else if (selectedId) {
      if (!lbExpanded) return;
      try {
        cachedFetch(`/api/cache/leaderboard/${selectedId}`) // 5min default cache
          .then(r => r.json())
          .then(data => setLadderData(data))
          .catch(() => {});
      } finally {
        setLbExpanded(false);
      }
    }
  }, [search, isCombinedMode, combinedLimit, selectedId, lbExpanded, combinedViewMode]);

  // Search functionality
  const handlePlayerSearch = async (qOverride?: string, opts?: { pushHistory?: boolean }) => {
    const q = (qOverride ?? searchQuery).trim();
    if (!q) return;

    // Ensure we record current state, then push new search state
    try {
      const currentState: AppState = {
        view: activeTab,
        searchQuery,
        selectedFaction,
        selectedMatchType,
        selectedCountry,
        selectedId,
        combinedViewMode,
      };
      if (typeof window !== 'undefined') {
        const currentUrl = buildUrl(currentState);
        window.history.replaceState(currentState, '', currentUrl);
        if (opts?.pushHistory !== false) {
          const newState: AppState = { view: 'search', searchQuery: q };
          const nextUrl = buildUrl(newState);
          window.history.pushState(newState, '', nextUrl);
        }
      }
    } catch {}

    setActiveTab('search');
    setSearchQuery(q);
    setSearchLoading(true);
    setSearchResults([]);
    setSearchLastUpdated(null);

    try {
      const response = await cachedFetch(`/api/cache/player/by-alias/${encodeURIComponent(q)}`); // 5min default cache
      let data: any = null;
      try {
        data = await response.json();
      } catch {}
      const results = Array.isArray(data?.results) ? data.results : [];
      setSearchResults(results);
      const updated = typeof data?.lastUpdated === 'string'
        ? data.lastUpdated
        : (() => {
          const first = results.find((r: any) => typeof r?.lastUpdated === 'string');
          return first?.lastUpdated;
        })();
      if (updated) {
        setSearchLastUpdated(updated);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  // Track if this is the first mount to avoid overwriting URL from initialization
  const isFirstMount = useRef(true);

  // Keep URL in sync as state changes (without pushing)
  useEffect(() => {
    // Skip sync on first mount - let the initialization useEffect handle it
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    const state: AppState = {
      view: activeTab,
      searchQuery,
      selectedFaction,
      selectedMatchType,
      selectedCountry,
      selectedId,
      combinedViewMode,
    };
    syncUrl(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchQuery, selectedFaction, selectedMatchType, selectedCountry, selectedId, combinedViewMode]);

  // Collapse mobile navigation when switching tabs
  useEffect(() => {
    setMobileNavOpen(false);
  }, [activeTab]);

  // Share handler and ephemeral copied state for the info bar button
  const [shareCopied, setShareCopied] = useState(false);
  const handleShare = async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1200);
    } catch {}
  };

  // Ephemeral copied indicator for per-result share buttons
  const [searchCardCopied, setSearchCardCopied] = useState<number | null>(null);

  // Trigger a search for a specific alias (stays in Search tab)
  const runSearchByName = async (name: string, profileId?: string) => {
    const q = (name || '').trim();
    if (!q) return;

    // If we have a profile ID, use the precise search method
    if (profileId) {
      setSearchQuery(q);
      _setSearchProfileId(profileId);

      try {
        setSearchLoading(true);
        setActiveTab('search');

        const response = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q })
        });

        if (response.ok) {
          const data = await response.json();
          const allResults = data.results || [];

          // Filter results to match the specific profile ID
          const filteredResults = allResults.filter((result: any) =>
            String(result.profileId) === String(profileId)
          );

          // If we found the specific player, use that result
          const finalResults = filteredResults.length > 0 ? filteredResults : allResults.slice(0, 1);

          setSearchResults(finalResults);
          setSearchLastUpdated(new Date().toISOString());

          // Update URL to reflect the search with profile ID
          const currentState: AppState = {
            view: 'search',
            searchQuery: q,
            searchProfileId: profileId,
            selectedFaction,
            selectedMatchType,
            selectedCountry,
            selectedId,
            combinedViewMode,
          };
          syncUrl(currentState);
        } else {
          // Fallback to original search method
          await handlePlayerSearch(q, { pushHistory: true });
        }
      } catch (error) {
        console.error('Profile search failed:', error);
        // Fallback to original search method
        await handlePlayerSearch(q, { pushHistory: true });
      } finally {
        setSearchLoading(false);
      }
    } else {
      // No profile ID provided, use original search and clear profile ID
      _setSearchProfileId(undefined);
      await handlePlayerSearch(q, { pushHistory: true });
    }
  };

  // Handlers for autocomplete search component
  const handleAutocompletePlayerSelect = async (player: PlayerSearchResult) => {
    _setSelectedPlayer(player);
    setSearchQuery(player.current_alias);
    _setSearchProfileId(player.profile_id);

    // Use the rich existing search API and filter results by profile ID
    try {
      setSearchLoading(true);

      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: player.current_alias })
      });

      if (response.ok) {
        const data = await response.json();
        const allResults = data.results || [];

        // Filter results to match the specific profile ID
        const filteredResults = allResults.filter((result: any) =>
          String(result.profileId) === String(player.profile_id)
        );

        // If we found the specific player, use that result
        // Otherwise, use the first result as fallback
        const finalResults = filteredResults.length > 0 ? filteredResults : allResults.slice(0, 1);

        setSearchResults(finalResults);
        setSearchLastUpdated(new Date().toISOString());

        // Update URL to reflect the search
        const currentState: AppState = {
          view: 'search',
          searchQuery: player.current_alias,
          searchProfileId: player.profile_id,
          selectedFaction,
          selectedMatchType,
          selectedCountry,
          selectedId,
        };
        syncUrl(currentState);
      } else {
        // Fallback to original search method
        await handlePlayerSearch(player.current_alias, { pushHistory: true });
      }
    } catch (error) {
      console.error('Profile search failed:', error);
      // Fallback to original search method
      await handlePlayerSearch(player.current_alias, { pushHistory: true });
    } finally {
      setSearchLoading(false);
    }
  };

  const handleExactSearch = () => {
    handlePlayerSearch();
  };

  useEffect(() => {
    if (!searchResults.length) return;

    const idsToFetch = searchResults
      .map(result => {
        const rawId = result?.profileId ?? result?.profile_id ?? result?.profileID;
        if (rawId === undefined || rawId === null) return null;
        const id = String(rawId).trim();
        if (!id) return null;
        if (steamProfiles[id] !== undefined) return null;
        if (steamProfileFetchesInFlight.current.has(id)) return null;
        return id;
      })
      .filter((id): id is string => Boolean(id));

    if (idsToFetch.length === 0) return;

    idsToFetch.forEach(id => steamProfileFetchesInFlight.current.add(id));

    let cancelled = false;

    const fetchSteamIds = async () => {
      try {
        const { data, error } = await supabase
          .from('players')
          .select('profile_id, steam_id64')
          .in('profile_id', idsToFetch);

        if (cancelled) return;

        if (error) {
          throw error;
        }

        setSteamProfiles(prev => {
          const next = { ...prev };
          idsToFetch.forEach(id => {
            if (next[id] === undefined) {
              next[id] = null;
            }
          });
          for (const row of data || []) {
            const id = String(row?.profile_id ?? '').trim();
            if (!id) continue;
            const value = typeof row?.steam_id64 === 'string' ? row.steam_id64.trim() : '';
            next[id] = value ? value : null;
          }
          return next;
        });
      } catch (error) {
        if (cancelled) return;
        console.warn('Failed to load Steam IDs from Supabase', error);
        setSteamProfiles(prev => {
          const next = { ...prev };
          idsToFetch.forEach(id => {
            if (next[id] === undefined) {
              next[id] = null;
            }
          });
          return next;
        });
      } finally {
        idsToFetch.forEach(id => steamProfileFetchesInFlight.current.delete(id));
      }
    };

    fetchSteamIds();

    return () => {
      cancelled = true;
    };
  }, [searchResults, steamProfiles]);

  const searchUpdatedAt: string | null = (() => {
    const firstWithTimestamp = searchResults.find(result => typeof (result as any)?.lastUpdated === 'string') as { lastUpdated?: string } | undefined;
    if (firstWithTimestamp?.lastUpdated) return firstWithTimestamp.lastUpdated;
    return searchLastUpdated;
  })();

  const favoriteEntries = Object.values(favorites);

  const resetPremiumPromptState = () => {
    setPremiumPromptChoice(null);
    setPremiumPromptError(null);
    setPremiumPromptResponseId(null);
    setPremiumEmailValue('');
    setPremiumEmailStatus('idle');
    setPremiumEmailError(null);
    setPremiumPromptLoading(false);
  };

  const handleOpenPremiumPrompt = (details: { alias?: string | null; profileId?: string; playerName?: string | null }) => {
    if (!premiumTeaserEnabled) return;
    const alias = (details.alias ?? '').trim() || 'Unknown player';
    setPremiumPromptContext({
      alias,
      profileId: details.profileId,
      playerName: details.playerName ?? alias,
    });
    resetPremiumPromptState();
  };

  const handleClosePremiumPrompt = () => {
    setPremiumPromptContext(null);
    resetPremiumPromptState();
  };

  const handlePremiumSurveySelection = async (choice: PremiumSurveyChoice) => {
    if (!premiumTeaserEnabled || !premiumPromptContext) return;
    setPremiumPromptLoading(true);
    setPremiumPromptError(null);
    try {
      const response = await fetch('/api/premium-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: premiumPromptContext.alias,
          profileId: premiumPromptContext.profileId,
          playerName: premiumPromptContext.playerName,
          choice,
          responseId: premiumPromptResponseId ?? undefined,
          source: 'search_teaser',
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to record preference');
      }

      const payload = await response.json().catch(() => ({}));
      if (payload && typeof payload.id === 'string') {
        setPremiumPromptResponseId(payload.id);
      }
      setPremiumPromptChoice(choice);
      setPremiumEmailStatus('idle');
      setPremiumEmailError(null);
    } catch (error) {
      console.error('Failed to record premium interest', error);
      setPremiumPromptError('We could not save your choice. Please try again.');
    } finally {
      setPremiumPromptLoading(false);
    }
  };

  const handlePremiumEmailSubmit = async () => {
    if (!premiumTeaserEnabled || !premiumPromptContext) return;
    const email = premiumEmailValue.trim();
    if (!email) {
      setPremiumEmailError('Please enter an email address.');
      setPremiumEmailStatus('error');
      return;
    }
    setPremiumEmailStatus('loading');
    setPremiumEmailError(null);
    try {
      const response = await fetch('/api/premium-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: premiumPromptContext.alias,
          profileId: premiumPromptContext.profileId,
          playerName: premiumPromptContext.playerName,
          choice: premiumPromptChoice,
          email,
          responseId: premiumPromptResponseId ?? undefined,
          source: 'search_teaser',
        }),
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Failed to save email');
      }

      const payload = await response.json().catch(() => ({}));
      if (payload && typeof payload.id === 'string') {
        setPremiumPromptResponseId(payload.id);
      }
      setPremiumEmailStatus('success');
    } catch (error) {
      console.error('Failed to save premium interest email', error);
      setPremiumEmailStatus('error');
      setPremiumEmailError('We could not save your email. Please try again.');
    }
  };

  const handleOpenAdvancedStats = (details: { profileId?: string; alias?: string | null; playerName?: string | null }) => {
    const profileId = (details.profileId || '').trim();
    if (!profileId) return;

    setActiveAdvancedStats((current) => {
      if (current?.profileId === profileId) {
        return null;
      }
      return {
        profileId,
        alias: details.playerName ?? details.alias ?? profileId,
      };
    });
    setMobileNavOpen(false);
  };

  useEffect(() => {
    if (!premiumPromptContext) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClosePremiumPrompt();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [premiumPromptContext]);

  const activateTabFromFooter = (tab: TabType) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      try {
        if (tab === 'support') {
          const supportEl = document.getElementById('support');
          if (supportEl) {
            supportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return;
          }
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch {
        // Ignore scroll failures (e.g. older browsers)
      }
    }
  };

  const handleSupportLink = () => activateTabFromFooter('support');

  const toggleFavorite = (
    candidate: { profileId?: string | number | null; alias?: string | null; playerName?: string; country?: string },
    fullResult?: any
  ) => {
    const aliasForKey = normalizeAlias(candidate.alias) || normalizeAlias(candidate.playerName);
    const profileIdStr = candidate.profileId !== undefined && candidate.profileId !== null
      ? String(candidate.profileId).trim()
      : undefined;
    const key = buildFavoriteKey(profileIdStr, aliasForKey);
    if (!key) return;

    const displayAlias = candidate.alias && candidate.alias.trim()
      ? candidate.alias.trim()
      : (candidate.playerName && candidate.playerName.trim()) || aliasForKey || key;
    const isAlreadyFavorite = Boolean(favorites[key]);

    if (isAlreadyFavorite) {
      const removalPayload = {
        action: 'remove' as const,
        profileId: profileIdStr,
        alias: displayAlias,
        playerName: candidate.playerName ?? displayAlias,
        occurredAt: new Date().toISOString(),
      };
      setFavorites(prev => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setRecentMatchLimits(prev => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      setFavoriteData(prev => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      fetch('/api/log-favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(removalPayload),
        keepalive: true,
      }).catch(() => {});
      return;
    }

    if (!aliasForKey && !profileIdStr) return;

    setFavorites(prev => ({
      ...prev,
      [key]: {
        key,
        profileId: profileIdStr,
        alias: displayAlias,
        playerName: candidate.playerName ?? displayAlias,
        country: candidate.country,
      },
    }));

    if (fullResult) {
      setFavoriteData(prev => ({
        ...prev,
        [key]: {
          result: fullResult,
          fetchedAt: Date.now(),
        },
      }));
    }

    const additionPayload = {
      action: 'add' as const,
      profileId: profileIdStr,
      alias: displayAlias,
      playerName: candidate.playerName ?? displayAlias,
      occurredAt: new Date().toISOString(),
    };

    fetch('/api/log-favorite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(additionPayload),
      keepalive: true,
    }).catch(() => {});
  };

  const refreshFavorite = (key: string) => {
    setFavoriteData(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const renderLeaderboardStatsBlock = (stats: any[] | undefined, limit: number = 6) => {
    if (!Array.isArray(stats) || stats.length === 0) return null;
    const items = stats
      .slice()
      .sort((a: any, b: any) => (b.lastmatchdate || 0) - (a.lastmatchdate || 0) || b.rating - a.rating)
      .slice(0, limit);

    return (
      <div className="mt-3 pt-3 border-t border-neutral-600/40">
        <h5 className="text-sm text-neutral-300 mb-2">Stats by Leaderboard:</h5>
        <div className="grid gap-2">
          {items.map((s: any, appIndex: number) => {
            const lb = leaderboards.find(l => l.id === s.leaderboardId);
            const name = lb?.name || `Leaderboard ${s.leaderboardId}`;
            const faction = lb?.faction || 'Unknown';
            const type = lb?.matchType || '';
            const displayLabel = (() => {
              if (faction === 'Unknown' && type === 'Custom') return 'Custom';
              if (!type) return faction;
              if (faction === 'Unknown') return type;
              return `${faction} ${type}`;
            })();
            return (
              <div key={`${s.leaderboardId}-${appIndex}`} className="text-xs bg-neutral-900 border border-neutral-600/25 p-2 rounded shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-1 rounded hover:bg-neutral-800/30 transition-all duration-200">
                  <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                    <span className={`${getFactionColor(faction)} inline-flex items-center`}>
                      <FactionLogo faction={faction} size={12} yOffset={0} />
                    </span>
                    <span className="text-orange-300 truncate" title={name}>
                      {displayLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 w-full sm:w-auto justify-start sm:justify-end">
                    <span className={getRankColor(s.rank)}>{s.rank > 0 ? `#${s.rank}` : '-'}</span>
                    <span className="text-white">{s.rating} ELO</span>
                    <span className="text-neutral-300">{s.wins}<span className="text-neutral-500">-</span>{s.losses}</span>
                    <span className="text-neutral-200">{(() => {
                      const total = (s.wins ?? 0) + (s.losses ?? 0);
                      if (!total) return '0%';
                      const pct = Math.round((s.wins / total) * 1000) / 10;
                      return `${pct}%`;
                    })()}</span>
                    <span className={`font-bold ${s.streak > 0 ? 'text-green-400' : s.streak < 0 ? 'text-red-400' : 'text-neutral-400'}`}>
                      {s.streak > 0 ? `+${s.streak}` : s.streak}
                    </span>
                    {s.lastmatchdate && (
                      <span className="text-neutral-400" title={new Date(s.lastmatchdate * 1000).toISOString()}>
                        {formatLastMatch(new Date(s.lastmatchdate * 1000))}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const mobileNavButtonClass = (tab: TabType) => `w-full flex items-center justify-between gap-3 px-4 py-3 font-medium rounded-md border transition-colors duration-300 ${
    activeTab === tab
      ? 'text-white bg-neutral-800/70 border-neutral-500/60 shadow-lg'
      : 'text-neutral-200 bg-neutral-900/40 border-neutral-700/60 hover:bg-neutral-800/60 hover:text-white'
  }`;

  const handleMobileNavSelect = (tab: TabType) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
  };

  useEffect(() => {
    if (activeTab !== 'favorites') return;
    const entries = Object.entries(favorites);
    if (entries.length === 0) {
      setFavoritesLoading(false);
      return;
    }
    const missing = entries.filter(([key]) => !favoriteData[key]);
    if (missing.length === 0) return;

    let cancelled = false;
    setFavoritesLoading(true);

    (async () => {
      const updates = await Promise.all(missing.map(async ([key, entry]) => {
        try {
          const res = await fetch(`/api/cache/player/by-alias/${encodeURIComponent(entry.alias)}`);
          let data: any = null;
          try {
            data = await res.json();
          } catch {}
          const results = Array.isArray(data?.results) ? data.results : [];
          const normalizedAlias = normalizeAlias(entry.alias);
          const matched = results.find((r: any) => {
            const resultProfileId = r?.profileId ? String(r.profileId) : undefined;
            const resultAlias = normalizeAlias(r?.personalStats?.profile?.alias ?? r?.playerName);
            if (entry.profileId && resultProfileId && entry.profileId === resultProfileId) return true;
            if (normalizedAlias && resultAlias === normalizedAlias) return true;
            return false;
          }) || results[0] || null;

          return {
            key,
            dataEntry: {
              result: matched,
              fetchedAt: Date.now(),
              error: matched ? undefined : 'not_found',
            } as FavoriteDataEntry,
          };
        } catch (error: any) {
          return {
            key,
            dataEntry: {
              result: null,
              fetchedAt: Date.now(),
              error: error?.message || 'Failed to load',
            } as FavoriteDataEntry,
          };
        }
      }));

      if (!cancelled) {
        setFavoriteData(prev => {
          const next = { ...prev };
          updates.forEach(({ key, dataEntry }) => {
            next[key] = dataEntry;
          });
          return next;
        });
      }
    })()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          setFavoritesLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeTab, favorites, favoriteData]);

  // Fetch and poll current Steam player count (cached via Supabase)
  useEffect(() => {
    let cancelled = false;
    const PLAYER_COUNT_CACHE_KEY = 'dow_player_count';
    const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes (matches Supabase cron refresh)

    const load = async () => {
      // Check localStorage cache first for instant display
      try {
        const cached = localStorage.getItem(PLAYER_COUNT_CACHE_KEY);
        if (cached) {
          const { count, timestamp } = JSON.parse(cached);
          const age = Date.now() - timestamp;
          if (age < CACHE_DURATION_MS) {
            setPlayerCount(count);
            setPlayerCountLoading(false);
            return; // Use cached value, skip API call
          }
        }
      } catch {}

      setPlayerCountLoading(true);
      try {
        const { data, error } = await supabase
          .from('steam_player_count')
          .select('player_count, updated_at')
          .eq('id', 1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          throw error;
        }

        const count = typeof data?.player_count === 'number' ? data.player_count : null;
        setPlayerCount(count);
        setPlayerCountLoading(false);

        if (count !== null) {
          try {
            localStorage.setItem(PLAYER_COUNT_CACHE_KEY, JSON.stringify({
              count,
              timestamp: Date.now()
            }));
          } catch {}
        }
      } catch {
        if (cancelled) return;
        setPlayerCount(null);
        setPlayerCountLoading(false);
      }
    };

    load();
    const id = setInterval(() => {
      load();
    }, CACHE_DURATION_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="min-h-screen text-white">
      <div className="container mx-auto px-3 py-4 sm:px-6 sm:py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          {/* Mobile Header & Navigation */}
          <div className="sm:hidden sticky top-0 z-50 -mx-3 px-3 pt-3 pb-3 bg-neutral-950/95 border-b border-neutral-800/70 backdrop-blur-md shadow-[0_12px_28px_rgba(0,0,0,0.55)]">
            <div className="flex items-start gap-3">
              <div className="flex flex-1 items-center gap-3 min-w-0">
                <Link
                  href="/"
                  className="flex-shrink-0 block"
                  aria-label="Go to home"
                >
                  <img
                    src="/assets/daw-logo.webp"
                    alt="Dawn of War: Definitive Edition"
                    className="h-10 w-auto object-contain flex-shrink-0"
                  />
                </Link>
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold text-white leading-tight">
                    Dawn of War: Definitive Edition Leaderboards
                  </h1>
                  <div className="mt-1 flex items-center gap-2 text-[0.65rem]">
                    <span className="px-2 py-0.5 bg-red-600 text-white font-semibold uppercase tracking-wide rounded-md">
                      BETA
                    </span>
                    <span className="inline-flex items-center px-2 py-0.5 bg-neutral-800/60 border border-neutral-600/50 rounded-md shadow-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" aria-hidden></span>
                      <span className="text-neutral-300">Players</span>
                      <span className="ml-1.5 font-semibold text-white">
                        {playerCount !== null ? playerCount.toLocaleString() : (playerCountLoading ? '…' : '—')}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(prev => !prev)}
                className={`flex h-10 w-10 items-center justify-center rounded-md border transition-colors duration-300 ${
                  mobileNavOpen
                    ? 'bg-neutral-800/80 border-neutral-500/60 text-white'
                    : 'bg-neutral-900/60 border-neutral-700/60 text-neutral-200 hover:bg-neutral-900/80'
                }`}
                aria-label="Toggle navigation"
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-nav-menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            </div>
            <div
              id="mobile-nav-menu"
              className={`overflow-hidden rounded-lg border border-neutral-700/60 bg-neutral-900/85 shadow-xl transition-all duration-300 ease-in-out transform ${
                mobileNavOpen ? 'mt-3 opacity-100 translate-y-0' : 'mt-0 opacity-0 -translate-y-2 pointer-events-none'
              }`}
              style={{ maxHeight: mobileNavOpen ? '520px' : '0px' }}
            >
              <div className="p-3 space-y-3">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleMobileNavSelect('leaderboards')}
                    className={mobileNavButtonClass('leaderboards')}
                  >
                    <span>Leaderboards</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMobileNavSelect('search')}
                    className={mobileNavButtonClass('search')}
                  >
                    <span>Search</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMobileNavSelect('favorites')}
                    className={mobileNavButtonClass('favorites')}
                  >
                    <span>Favourites</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMobileNavSelect('replays')}
                    className={mobileNavButtonClass('replays')}
                  >
                    <span className="flex items-center gap-2">
                      Replays
                      <span className="px-2 py-0.5 bg-red-600 text-white text-[0.65rem] font-semibold uppercase tracking-wide rounded-md">
                        NEW
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMobileNavSelect('support')}
                    className={mobileNavButtonClass('support')}
                  >
                    <SupportTabKoFiButton className="h-9" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 text-sm">
                  <a
                    href="https://github.com/EnzeD/dow-leaderboards"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/60 px-4 py-2 font-medium text-neutral-300 transition-colors duration-300 hover:bg-neutral-800/70 hover:text-white"
                  >
                    GitHub
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <button
                    onClick={() => {
                      setMobileNavOpen(false);
                      setShowFeedbackModal(true);
                    }}
                    className="flex items-center justify-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/60 px-4 py-2 font-medium text-neutral-300 transition-colors duration-300 hover:bg-neutral-800/70 hover:text-white"
                  >
                    Feedback
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  </button>
                  <button
                    onClick={handleClearCache}
                    className="col-span-2 flex items-center justify-center gap-2 rounded-md border border-neutral-700/50 bg-neutral-900/60 px-4 py-2 font-medium text-neutral-300 transition-colors duration-300 hover:bg-neutral-800/70 hover:text-white"
                    title="Clear cached data and refresh"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh data
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden sm:flex items-center justify-between">
            <div className="flex items-center">
              <Link
                href="/"
                className="mr-4 block"
                aria-label="Go to home"
              >
                <img
                  src="/assets/daw-logo.webp"
                  alt="Dawn of War: Definitive Edition"
                  className="h-16 w-auto object-contain"
                />
              </Link>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl md:text-3xl font-bold text-white">
                  Dawn of War: Definitive Edition Leaderboards
                </h1>
                <span className="px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded-md">
                  BETA
                </span>
              </div>
            </div>
            <div className="ml-6 flex items-center gap-3">
              <div className="hidden md:flex items-center px-3 py-1.5 bg-neutral-800/50 border border-neutral-600/50 rounded-md shadow-sm">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-2" aria-hidden></span>
                <span className="text-sm text-neutral-300">Players online</span>
                <span className="ml-2 text-sm font-semibold text-white">
                  {playerCount !== null ? playerCount.toLocaleString() : (playerCountLoading ? '…' : '—')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="mb-4 sm:mb-6 sm:border-b sm:border-neutral-700/60">
          {/* Desktop Navigation */}
          <div className="hidden sm:flex">
            <button
              onClick={() => setActiveTab('leaderboards')}
              className={`px-6 py-3 font-medium transition-all duration-300 ${
                activeTab === 'leaderboards'
                  ? 'text-white border-b-3 border-neutral-400 bg-neutral-800/50 shadow-lg'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
              }`}
            >
              Leaderboards
            </button>
            <button
              onClick={() => setActiveTab('search')}
              className={`px-6 py-3 font-medium transition-all duration-300 ${
                activeTab === 'search'
                  ? 'text-white border-b-3 border-neutral-400 bg-neutral-800/50 shadow-lg'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
              }`}
            >
              Search
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-6 py-3 font-medium transition-all duration-300 ${
                activeTab === 'favorites'
                  ? 'text-white border-b-3 border-neutral-400 bg-neutral-800/50 shadow-lg'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
              }`}
            >
              Favourites
            </button>
            <button
              onClick={() => setActiveTab('replays')}
              className={`px-6 py-3 font-medium transition-all duration-300 flex items-center justify-center gap-2 whitespace-nowrap ${
                activeTab === 'replays'
                  ? 'text-white border-b-3 border-neutral-400 bg-neutral-800/50 shadow-lg'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
              }`}
            >
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                Replays
                <span className="px-2 py-0.5 bg-red-600 text-white text-[0.65rem] font-semibold uppercase tracking-wide rounded-md">
                  NEW
                </span>
              </span>
            </button>
            <a
              href="https://github.com/EnzeD/dow-leaderboards"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto px-6 py-3 font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/30 transition-all duration-300 flex items-center gap-2"
            >
              Contribute on GitHub
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <button
              onClick={() => setShowFeedbackModal(true)}
              className="px-6 py-3 font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/30 transition-all duration-300 flex items-center gap-2"
            >
              Provide Feedback
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </button>
            <button
              onClick={() => setActiveTab('support')}
              className={`px-6 py-3 font-medium transition-all duration-300 flex items-center justify-center ${
                activeTab === 'support'
                  ? 'text-white border-b-3 border-neutral-400 bg-neutral-800/50 shadow-lg'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
              }`}
            >
              <SupportTabKoFiButton className="h-9" />
            </button>
          </div>
        </div>

        {/* Leaderboards Tab Content */}
        {activeTab === 'leaderboards' && (
          <>
            {/* Filter Bar */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-neutral-900/50 rounded-lg border border-neutral-700/40" style={{boxShadow: '0 0 20px rgba(0, 0, 0, 0.5)'}}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col">
              <label htmlFor="match-type-select" className="text-sm text-neutral-300 mb-2 font-medium">Type</label>
              <select
                id="match-type-select"
                name="matchType"
                value={selectedMatchType}
                onChange={(e) => setSelectedMatchType(e.target.value)}
                className="bg-neutral-900 border border-neutral-600/50 rounded-md px-3 py-3 text-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/20 transition-all text-base"
                disabled={loading}
              >
                {matchTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            {showFactionFilter && (
              <div className="flex flex-col">
                <label htmlFor="faction-select" className="text-sm text-neutral-300 mb-2 font-medium">Faction</label>
                <select
                  id="faction-select"
                  name="faction"
                  value={selectedFaction}
                  onChange={(e) => handleFactionChange(e.target.value)}
                  className="bg-neutral-900 border border-neutral-600/50 rounded-md px-3 py-3 text-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/20 transition-all text-base"
                  disabled={loading}
                >
                  {factions.map(faction => (
                    <option key={faction} value={faction}>{faction}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-col">
              <label htmlFor="country-select" className="text-sm text-neutral-300 mb-2 font-medium">Country</label>
              <select
                id="country-select"
                name="country"
                autoComplete="country"
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="bg-neutral-900 border border-neutral-600/50 rounded-md px-3 py-3 text-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/20 transition-all text-base"
                disabled={loading}
              >
                {countries.map(country => (
                  <option key={country} value={country}>{country}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Specific Leaderboard Selection & Search */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-neutral-900/30 rounded-lg border border-neutral-700/30" style={{backdropFilter: 'blur(10px)'}}>
          <div className="flex flex-col gap-4">
            {/* Specific Leaderboard selection removed: faction + match type drive selection */}

            <div className="flex flex-col">
              <label htmlFor="leaderboard-search" className="text-xs text-neutral-400 mb-1">Search Players</label>
              <input
                id="leaderboard-search"
                name="leaderboardSearch"
                type="text"
                placeholder="Search players..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && search.trim() && filteredRows.length === 0 && lbExpanded) {
                    setActiveTab('search');
                    setSearchQuery(search.trim());
                    setTriggerAutocomplete(true);
                  }
                }}
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-600/50 rounded-md text-white placeholder-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/20 transition-all text-base"
              />
            </div>
            {search.trim() && filteredRows.length === 0 && lbExpanded && (
              <div className="text-xs sm:text-sm text-neutral-300 bg-neutral-900/40 border border-neutral-700/40 rounded-md p-3">
                <span className="font-semibold text-white">No results on this leaderboard.</span>{' '}
                <span>
                  Try a profile search.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('search');
                    setSearchQuery(search.trim());
                    setTriggerAutocomplete(true);
                  }}
                  className="ml-2 inline-flex items-center gap-1 px-2 py-1 rounded border border-neutral-600/40 bg-neutral-800/60 hover:bg-neutral-700/60 text-white transition-colors font-semibold"
                >
                  Go to Profile Search
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Current Selection Info */}
        {(selectedLeaderboard || isCombinedMode || selectedFaction === "All factions") && (
          <div className="mb-4 text-sm text-neutral-300 font-medium p-3 bg-neutral-900/40 rounded-md border border-neutral-700/30" style={{backdropFilter: 'blur(5px)'}}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 space-y-1">
                <div>
                  Showing: {isCombinedMode
                    ? `Combined 1v1 Rankings • ${combinedViewMode === 'all' ? 'All faction placements' : 'Best per player'}`
                    : (selectedFaction === "All factions" ? `All factions • ${selectedMatchType}` : `${selectedLeaderboard?.faction} • ${selectedLeaderboard?.matchType}`)}
                </div>
                {ladderData && (
                  <div className="text-xs text-neutral-400">
                    Last updated: {new Date(ladderData.lastUpdated).toLocaleString()}
                    {ladderData.stale && (
                      <span className="ml-2 px-2 py-1 bg-yellow-600 text-yellow-100 rounded">Stale Data</span>
                    )}
                  </div>
                )}
                {isCombinedMode && (
                  <div className="text-xs text-neutral-400">
                    {combinedViewMode === 'all'
                      ? 'Players appear once for every faction they rank in. Expect duplicate names when someone excels with multiple armies.'
                      : 'Shows each player once, using the faction where they currently have the highest rating.'}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {isCombinedMode && (
                  <div className="flex items-center gap-1 bg-neutral-800/70 border border-neutral-600/40 rounded-md px-2 py-1 text-xs text-neutral-200">
                    <span className="uppercase tracking-wide text-neutral-400 font-semibold">View</span>
                    <button
                      type="button"
                      onClick={() => setCombinedViewMode('best')}
                      disabled={combinedViewMode === 'best' || loading}
                      aria-pressed={combinedViewMode === 'best'}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors ${combinedViewMode === 'best' ? 'bg-neutral-500 text-white' : 'text-neutral-300 hover:text-white'}`}
                    >
                      Best per player
                    </button>
                    <button
                      type="button"
                      onClick={() => setCombinedViewMode('all')}
                      disabled={combinedViewMode === 'all' || loading}
                      aria-pressed={combinedViewMode === 'all'}
                      className={`px-2 py-0.5 rounded font-semibold transition-colors ${combinedViewMode === 'all' ? 'bg-neutral-500 text-white' : 'text-neutral-300 hover:text-white'}`}
                    >
                      All faction placements
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleShare}
                  className="shrink-0 inline-flex items-center gap-2 px-3 py-1.5 bg-neutral-800/70 hover:bg-neutral-700/70 text-white rounded-md border border-neutral-600/40 transition-colors"
                  title="Share this view"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a1 1 0 001 1h12a1 1 0 001-1v-7M16 6l-4-4m0 0L8 6m4-4v12" />
                  </svg>
                  <span className={`text-xs font-semibold ${shareCopied ? 'text-green-400' : ''}`}>{shareCopied ? 'Link copied' : 'Copy link'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table - Desktop */}
        {loading ? (
          <>
            {/* Desktop Skeleton */}
            <div className="hidden md:block bg-neutral-900 border border-neutral-600/40 rounded-lg shadow-2xl overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-800 border-b-2 border-neutral-600/50" style={{background: 'linear-gradient(135deg, #262626, #171717)'}}>
                  <tr>
                    {[
                      { key: "rank", label: "Rank" },
                      { key: "rankDelta", label: "↑↓" },
                      { key: "playerName", label: "Alias" },
                      ...(isCombinedMode ? [{ key: "faction", label: "Faction" }] : []),
                      { key: "rating", label: "ELO" },
                      { key: "streak", label: "Streak" },
                      { key: "wins", label: "Wins" },
                      { key: "losses", label: "Losses" },
                      { key: "winrate", label: "Ratio" },
                      { key: "lastMatchDate", label: "Last Game" },
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        className={`py-3 ${key === "rank" || key === "rankDelta" ? "px-3" : "px-4"} ${key === "rank" || key === "rankDelta" ? "text-center" : "text-left"} text-white font-bold border-r border-neutral-600/30 last:border-r-0 whitespace-nowrap ${key === "rank" || key === "rankDelta" ? "w-14" : ""}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 30 }).map((_, i) => (
                    <tr key={i} className={`${i % 2 === 0 ? "bg-neutral-900/80" : "bg-neutral-800/80"} border-b border-neutral-600/20`}>
                      <td className="px-3 py-3 border-r border-neutral-600/20 w-14 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <div className="h-4 w-4 bg-neutral-700 rounded animate-pulse"></div>
                          <div className="h-5 w-6 bg-neutral-700 rounded animate-pulse"></div>
                        </div>
                      </td>
                      <td className="px-3 py-3 border-r border-neutral-600/20 w-14">
                        <div className="flex items-center justify-center">
                          <div className="h-5 w-8 bg-neutral-700 rounded animate-pulse"></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 border-r border-neutral-600/20 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="h-4 w-6 bg-neutral-700 rounded animate-pulse shrink-0"></div>
                          <div className="h-5 bg-neutral-700 rounded animate-pulse" style={{ width: `${180 + (i * 17) % 100}px` }}></div>
                        </div>
                      </td>
                      {isCombinedMode && (
                        <td className="px-4 py-3 border-r border-neutral-600/20">
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 bg-neutral-700 rounded animate-pulse"></div>
                            <div className="h-5 w-28 bg-neutral-700 rounded animate-pulse"></div>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 border-r border-neutral-600/20">
                        <div className="h-5 w-14 bg-neutral-700 rounded animate-pulse"></div>
                      </td>
                      <td className="px-4 py-3 border-r border-neutral-600/20">
                        <div className="h-5 w-10 bg-neutral-700 rounded animate-pulse"></div>
                      </td>
                      <td className="px-4 py-3 border-r border-neutral-600/20">
                        <div className="h-5 w-10 bg-neutral-700 rounded animate-pulse"></div>
                      </td>
                      <td className="px-4 py-3 border-r border-neutral-600/20">
                        <div className="h-5 w-10 bg-neutral-700 rounded animate-pulse"></div>
                      </td>
                      <td className="px-4 py-3 border-r border-neutral-600/20">
                        <div className="h-5 w-14 bg-neutral-700 rounded animate-pulse"></div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="h-5 w-24 bg-neutral-700 rounded animate-pulse"></div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Skeleton */}
            <div className="md:hidden space-y-1">
              {Array.from({ length: 30 }).map((_, i) => (
                <div key={i} className={`${i % 2 === 0 ? "bg-neutral-900/70" : "bg-neutral-800/70"} border border-neutral-600/30 rounded p-2`}>
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-8 bg-neutral-700 rounded animate-pulse"></div>
                    <div className="h-4 bg-neutral-700 rounded animate-pulse flex-1" style={{ maxWidth: '120px' }}></div>
                    <div className="h-4 w-12 bg-neutral-700 rounded animate-pulse"></div>
                    <div className="h-4 w-16 bg-neutral-700 rounded animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-neutral-900 border border-neutral-600/40 rounded-lg shadow-2xl overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-800 border-b-2 border-neutral-600/50" style={{background: 'linear-gradient(135deg, #262626, #171717)'}}>
                  <tr>
                    {[
                      { key: "rank", label: "Rank" },
                      { key: "rankDelta", label: "↑↓" },
                      { key: "playerName", label: "Alias" },
                      ...(isCombinedMode ? [
                        { key: "faction", label: "Faction" }
                      ] : []),
                      { key: "rating", label: "ELO" },
                      { key: "streak", label: "Streak" },
                      { key: "wins", label: "Wins" },
                      { key: "losses", label: "Losses" },
                      { key: "winrate", label: "Ratio" },
                      { key: "lastMatchDate", label: "Last Game" },
                    ].map(({ key, label }) => (
                      <th
                        key={key}
                        className={`py-3 ${key === "rank" || key === "rankDelta" ? "px-3" : "px-4"} ${key === "rank" || key === "rankDelta" ? "text-center" : "text-left"} cursor-pointer hover:bg-neutral-700/30 text-white font-bold border-r border-neutral-600/30 last:border-r-0 transition-all duration-300 whitespace-nowrap ${key === "rank" || key === "rankDelta" ? "w-14" : ""}`}
                        onClick={() => handleSort(key as keyof LadderRow)}
                      >
                        {label}
                        {sortField === key && (
                          <span className="ml-1 text-yellow-400 text-lg">{sortDesc ? "↓" : "↑"}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => {
                    const entryKey = `${row.profileId}-${row.leaderboardId ?? row.faction ?? 'combined'}-${row.originalRank ?? row.rank}`;
                    return (
                      <tr key={entryKey} className={`${i % 2 === 0 ? "bg-neutral-900/80" : "bg-neutral-800/80"} hover:bg-neutral-700/30 border-b border-neutral-600/20 transition-all duration-300 backdrop-blur-sm`}>
                      <td className={`px-3 py-3 ${getRankColor(row.rank)} font-bold text-sm border-r border-neutral-600/20 w-14 text-center`}>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-lg drop-shadow-lg">{getTierIndicator(row.rank)}</span>
                          <span className="font-bold">
                            {row.rank}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 border-r border-neutral-600/20 w-14">
                        <div className="flex items-center justify-center">
                          <RankDeltaBadge delta={row.rankDelta} hasHistory={hasRankDeltaData} />
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${row.playerName === "Unknown" ? "text-neutral-500" : "text-white font-medium"} border-r border-neutral-600/20 min-w-0`}>
                        <div className="flex items-center gap-2">
                          {row.country && <FlagIcon countryCode={row.country} />}
                          <button
                            type="button"
                            onClick={() => runSearchByName(row.playerName, row.profileId)}
                            className="truncate text-left hover:underline"
                            title={`Search for ${row.playerName}`}
                          >
                            {row.playerName}
                          </button>
                          {row.level && (
                            <span className="text-xs text-neutral-400 bg-neutral-800 px-1.5 py-0.5 rounded">
                              Lv. {row.level}
                            </span>
                          )}
                        </div>
                      </td>
                      {isCombinedMode && (
                        <td className={`px-4 py-3 font-semibold border-r border-neutral-600/20 ${getFactionColor(row.faction || '')}`}>
                          <div className="flex items-center gap-2 min-w-0">
                            <FactionLogo faction={row.faction || undefined} size={18} />
                            <span className="truncate">{row.faction || 'Unknown'}</span>
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3 text-white font-bold border-r border-neutral-600/20">{row.rating}</td>
                      <td className={`px-4 py-3 font-bold border-r border-neutral-600/20 ${row.streak > 0 ? "text-green-400" : row.streak < 0 ? "text-red-400" : "text-neutral-400"}`}>
                        {row.streak > 0 ? `+${row.streak}` : row.streak}
                      </td>
                      <td className="px-4 py-3 text-green-400 font-semibold border-r border-neutral-600/20">{row.wins}</td>
                      <td className="px-4 py-3 text-red-400 font-semibold border-r border-neutral-600/20">{row.losses}</td>
                      <td className="px-4 py-3 text-white font-semibold border-r border-neutral-600/20">{row.winrate}%</td>
                      <td className="px-4 py-3 text-neutral-300 text-xs font-medium">
                        <span className="truncate">{formatLastMatch(row.lastMatchDate)}</span>
                      </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View - Ultra Compact Single Line */}
            <div className="md:hidden space-y-1">
              {sortedRows.map((row, i) => {
                const entryKey = `${row.profileId}-${row.leaderboardId ?? row.faction ?? 'combined'}-${row.originalRank ?? row.rank}`;
                return (
                  <div key={entryKey} className={`${i % 2 === 0 ? "bg-neutral-900/70" : "bg-neutral-800/70"} border border-neutral-600/30 rounded p-2 backdrop-blur-sm`}>
                  {/* Everything in one line */}
                  <div className="flex items-center gap-2 text-xs">
                    {/* Rank */}
                    <div className={`flex items-center gap-1 ${getRankColor(row.rank)} shrink-0`}>
                      <span className="text-xs">{getTierIndicator(row.rank)}</span>
                      <span className="font-bold text-xs">{row.rank}</span>
                    </div>

                    <RankDeltaBadge delta={row.rankDelta} hasHistory={hasRankDeltaData} size="sm" />

                    {/* Player Name with Flag */}
                    <div className={`flex items-center gap-1 min-w-0 flex-1 ${row.playerName === "Unknown" ? "text-neutral-500" : "text-white"}`}>
                      {row.country && <FlagIcon countryCode={row.country} compact />}
                      <button
                        type="button"
                        onClick={() => runSearchByName(row.playerName, row.profileId)}
                        className="text-xs truncate font-medium text-left hover:underline"
                        title={`Search for ${row.playerName}`}
                      >
                        {row.playerName}
                      </button>
                      {row.level && (
                        <span className="text-xs text-neutral-400 bg-neutral-800 px-1 py-0.5 rounded">
                          {row.level}
                        </span>
                      )}
                    {isCombinedMode && (
                      <span className={`text-xs font-semibold ml-1 ${getFactionColor(row.faction || '')} inline-flex items-center gap-1`}>
                        <FactionLogo faction={row.faction || undefined} size={14} />
                        {row.faction ? row.faction.slice(0, 3) : 'Unk'}
                      </span>
                    )}
                    </div>

                    {/* Stats - Ultra compact */}
                    <div className="flex items-center gap-2 shrink-0 text-xs">
                      <span className="text-white font-bold">{row.rating}</span>
                      <span className="text-green-400 font-semibold">{row.wins}</span>
                      <span className="text-neutral-500">-</span>
                      <span className="text-red-400 font-semibold">{row.losses}</span>
                      <span className={`font-bold ${row.streak > 0 ? "text-green-400" : row.streak < 0 ? "text-red-400" : "text-neutral-400"}`}>
                        {row.streak > 0 ? `+${row.streak}` : row.streak}
                      </span>
                    </div>
                  </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

            {/* Combined controls */}
            {activeTab === 'leaderboards' && isCombinedMode && (
              <div className="mt-4 text-center">
                {combinedLimit === 200 ? (
                  <button
                    type="button"
                    onClick={() => setCombinedLimit(1000)}
                    className="text-blue-300 hover:underline font-medium"
                  >
                    Show top 1000
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCombinedLimit(200)}
                    className="text-blue-300 hover:underline font-medium"
                  >
                    Show top 200
                  </button>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 text-center text-sm text-neutral-400 font-medium p-4 bg-neutral-900/20 rounded-lg border border-neutral-700/20" style={{backdropFilter: 'blur(5px)'}}>
              Data from Relic Community API • Updates in real-time
            </div>
          </>
        )}

        {/* Search Tab Content */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-600/40 rounded-lg p-4 sm:p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">Player Search</h2>
              <p className="text-neutral-400 mb-6">
                Search your alias name. In case there is no result, try typing exactly what is your current in-game alias, case is sensitive.
              </p>
              <div className="mb-6">
                <AutocompleteSearch
                  value={searchQuery}
                  onChange={setSearchQuery}
                  onSelect={handleAutocompletePlayerSelect}
                  onExactSearch={handleExactSearch}
                  loading={searchLoading}
                  placeholder="Type player name for instant results..."
                  triggerSearch={triggerAutocomplete}
                  onSearchTriggered={() => setTriggerAutocomplete(false)}
                />
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <h3 className="text-lg font-semibold text-white">Search Results</h3>
                  </div>
                  <div className="grid gap-4 grid-cols-1">
                    {searchResults.map((result, index) => {
                      const profileIdStr = result?.profileId ? String(result.profileId) : undefined;
                      const aliasPrimary = result?.personalStats?.profile?.alias ?? result?.playerName ?? result?.alias ?? '';
                      const aliasFallback = aliasPrimary || searchQuery;
                      const favoriteKey = buildFavoriteKey(profileIdStr, aliasFallback);
                      const isFavorite = favoriteKey ? Boolean(favorites[favoriteKey]) : false;
                      const canFavorite = Boolean(favoriteKey && aliasFallback);
                      const favoriteCandidateAlias = aliasPrimary || aliasFallback;
                      const hasSteamLookup = profileIdStr ? Object.prototype.hasOwnProperty.call(steamProfiles, profileIdStr) : false;
                      const steamIdFromDbRaw = profileIdStr ? steamProfiles[profileIdStr] : undefined;
                      const steamIdFromDb = typeof steamIdFromDbRaw === 'string' ? steamIdFromDbRaw.trim() : undefined;
                      const fallbackSteamId = typeof result?.steamId === 'string' ? result.steamId.trim() : undefined;
                      const resolvedSteamId = steamIdFromDb && steamIdFromDb.length > 0
                        ? steamIdFromDb
                        : (fallbackSteamId && fallbackSteamId.length > 0 ? fallbackSteamId : undefined);
                      const steamProfileUrl = resolvedSteamId ? `https://steamcommunity.com/profiles/${resolvedSteamId}` : undefined;
                      const renderFavoriteButton = (extraClasses: string = '') => (
                        <button
                          type="button"
                          onClick={() => canFavorite && toggleFavorite({
                            profileId: profileIdStr,
                            alias: favoriteCandidateAlias,
                            playerName: result.playerName,
                            country: result.personalStats?.profile?.country,
                          }, result)}
                          className={`inline-flex items-center justify-center rounded-full border border-neutral-600/40 px-3 py-1 transition ${
                            isFavorite
                              ? 'text-yellow-400 bg-neutral-800/70'
                              : 'text-neutral-300 hover:text-yellow-300 hover:bg-neutral-800/40'
                          } ${extraClasses}`.trim()}
                          aria-pressed={isFavorite}
                          disabled={!canFavorite}
                          title={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                        >
                          <svg
                            className="w-4 h-4"
                            viewBox="0 0 24 24"
                            fill={isFavorite ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth={isFavorite ? 1 : 1.5}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.317 4.043a1 1 0 00.95.69h4.268c.969 0 1.371 1.24.588 1.81l-3.453 2.507a1 1 0 00-.364 1.118l1.317 4.043c.3.921-.755 1.688-1.54 1.118L12 15.347l-3.534 2.609c-.784.57-1.838-.197-1.539-1.118l1.317-4.043a1 1 0 00-.364-1.118L4.427 9.47c-.783-.57-.38-1.81.588-1.81h4.268a1 1 0 00.95-.69l1.317-4.043z" />
                          </svg>
                          <span className="ml-2 hidden text-xs font-semibold sm:inline">
                            {isFavorite ? 'Remove favourite' : 'Add to favourite'}
                          </span>
                        </button>
                      );

                      const steamLookupPending = profileIdStr ? steamProfileFetchesInFlight.current.has(profileIdStr) && !hasSteamLookup : false;

                      return (
                      <div key={index} className="bg-neutral-800 border border-neutral-600/30 rounded-lg p-4 shadow-lg">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                            <h4 className="text-white font-medium">{result.playerName}</h4>
                            {result.personalStats?.profile?.country && (
                              <div className="flex items-center gap-1">
                                <FlagIcon countryCode={result.personalStats.profile.country} />
                              </div>
                            )}
                            {(typeof result.personalStats?.profile?.xp === 'number') && (
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-neutral-400">Level</span>
                                <span className="text-white">{getLevelFromXP(result.personalStats.profile.xp)}</span>
                              </div>
                            )}
                            {typeof result.personalStats?.profile?.xp === 'number' && (
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-neutral-400">XP</span>
                                <span className="text-white">{result.personalStats.profile.xp.toLocaleString?.() || result.personalStats.profile.xp}</span>
                                {canFavorite && renderFavoriteButton('sm:hidden ml-1')}
                              </div>
                            )}
                            {!result.personalStats?.profile?.xp && canFavorite && renderFavoriteButton('sm:hidden')}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:gap-3 sm:items-center sm:justify-end sm:text-right">
                            {canFavorite && renderFavoriteButton('hidden sm:inline-flex')}
                            {steamProfileUrl ? (
                              <a
                                href={steamProfileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 flex-1 min-w-[140px] order-1 sm:order-none sm:flex-initial sm:min-w-0 px-3 py-1.5 rounded-md border border-neutral-600/40 bg-[#171a21] text-[#c7d5e0] hover:bg-[#1b2838] transition-colors"
                              >
                                <img src="/assets/steam-logo.svg" alt="Steam" className="h-4 w-4 shrink-0" />
                                <span className="text-xs font-semibold">Steam profile</span>
                              </a>
                            ) : profileIdStr ? (
                              steamLookupPending ? (
                                <span className="text-xs text-neutral-400">Fetching Steam profile…</span>
                              ) : hasSteamLookup ? (
                                <span className="text-xs text-neutral-500">Steam profile unavailable</span>
                              ) : null
                            ) : null}
                            {(result.lastUpdated || searchUpdatedAt) && (
                              <span className="order-3 w-full text-xs text-neutral-400 text-left sm:order-none sm:w-auto sm:text-right">
                                Last updated: {formatTimestamp(result.lastUpdated || searchUpdatedAt) ?? 'Unknown'}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const profileId = result?.profileId ? String(result.profileId) : undefined;
                                  const url = buildUrl({
                                    view: 'search',
                                    searchQuery,
                                    searchProfileId: profileId
                                  });
                                  await navigator.clipboard.writeText(url);
                                  setSearchCardCopied(index);
                                  setTimeout(() => setSearchCardCopied(null), 1200);
                                } catch {}
                              }}
                              className="inline-flex items-center justify-center gap-2 flex-1 min-w-[140px] order-2 sm:order-none sm:flex-initial sm:min-w-0 px-3 py-1.5 bg-neutral-800/70 hover:bg-neutral-700/70 text-white rounded-md border border-neutral-600/40 transition-colors"
                              title="Copy link to this player search"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a1 1 0 001 1h12a1 1 0 001-1v-7M16 6l-4-4m0 0L8 6m4-4v12" />
                              </svg>
                              <span className={`text-xs font-semibold ${searchCardCopied === index ? 'text-green-400' : ''}`}>{searchCardCopied === index ? 'Link copied' : 'Copy link'}</span>
                            </button>
                          </div>
                        </div>

                        {renderLeaderboardStatsBlock(result.personalStats?.leaderboardStats, 6)}

                        {premiumTeaserEnabled && (
                          <div className="mt-4 rounded-xl border border-yellow-500/25 bg-neutral-900/80 p-4 shadow-lg">
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
                                  <p className="text-sm font-semibold text-white">Advanced statistics</p>
                                  <p className="text-xs text-neutral-300">
                                    Get access to maximum stats while supporting the website.
                                  </p>
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-col text-xs text-neutral-400 sm:text-right">
                                <span className="uppercase tracking-wide text-yellow-300">Built for Dawn of War</span>
                                <span>Everything you need to climb.</span>
                              </div>
                            </div>
                            <div className="mt-3 rounded-lg border border-yellow-500/20 bg-neutral-950/70 p-4">
                              <div className="flex items-center justify-between text-[0.65rem] uppercase tracking-wide text-yellow-300">
                                <span>Matchup intelligence</span>
                                <span className="text-neutral-500">Advanced view</span>
                              </div>
                              <div className="mt-3 grid h-14 w-full grid-cols-6 gap-1" aria-hidden="true">
                                {['a', 'b', 'c', 'd', 'e', 'f'].map((token) => (
                                  <div
                                    key={token}
                                    className="rounded-md bg-gradient-to-b from-yellow-500/25 via-yellow-500/10 to-yellow-500/5 blur-sm"
                                  />
                                ))}
                              </div>
                            </div>
                            <ul className="mt-4 space-y-1.5 text-xs text-neutral-200">
                              {[ 
                                'A dedicated bot that will build your data every day',
                                'ELO ratings over time',
                                'Win rate per match-up',
                                'Win rate per maps',
                                'Win rate against frequent opponents',
                                'Unlimited match history (starting after activation)'
                              ].map((benefit) => (
                                <li key={benefit} className="flex items-start gap-2">
                                  <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-yellow-400/20 text-yellow-300">
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
                                  <span>{benefit}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {profileIdStr && activeAdvancedStats?.profileId === profileIdStr && (
                          <div className="mt-4">
                            <AdvancedStatsPanel
                              profileId={profileIdStr}
                              alias={aliasPrimary || aliasFallback}
                              onRequestAccess={premiumTeaserEnabled ? () => handleOpenPremiumPrompt({
                                alias: aliasPrimary || aliasFallback,
                                profileId: profileIdStr,
                                playerName: result.playerName,
                              }) : undefined}
                              variant="embedded"
                            />
                          </div>
                        )}
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs text-neutral-300 sm:max-w-md">
                            Climb the Dawn of War ladders and have fun doing it. The Emperor demands.
                          </p>
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
                                {profileIdStr && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenAdvancedStats({
                                      alias: aliasPrimary || aliasFallback,
                                      profileId: profileIdStr,
                                      playerName: result.playerName,
                                    })}
                                    className="inline-flex items-center justify-center rounded-md border border-yellow-400/30 bg-yellow-400 px-3 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-300"
                                  >
                                    View advanced statistics
                                  </button>
                                )}
                            {premiumTeaserEnabled && (
                              <button
                                type="button"
                                onClick={() => handleOpenPremiumPrompt({
                                  alias: aliasPrimary || aliasFallback,
                                  profileId: profileIdStr,
                                  playerName: result.playerName,
                                })}
                                className="inline-flex items-center justify-center rounded-md border border-neutral-700/60 bg-neutral-900 px-3 py-2 text-sm font-semibold text-neutral-200 transition hover:text-white hover:border-neutral-500"
                              >
                                Request access
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Recent Match History */}
                        {result.recentMatches && result.recentMatches.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-neutral-600/40">
                            <div className="flex items-center gap-2 mb-2">
                              <h5 className="text-sm text-neutral-300">Recent Match History</h5>
                              <div className="group relative">
                                <svg
                                  className="w-4 h-4 text-neutral-500 cursor-help"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                  />
                                </svg>
                                <div className="absolute left-0 top-6 w-72 p-3 bg-neutral-800 border border-neutral-600 rounded-md shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 text-xs text-neutral-300 leading-relaxed">
                                  Missing a recent match? Matches are only recorded when the winner clicks &quot;NO&quot; to skip exploring the map at the end of the game. Always press &quot;NO&quot; to ensure your match appears in the history.
                                </div>
                              </div>
                            </div>
                            {(() => {
                              const aliasForKey = result?.personalStats?.profile?.alias ?? result?.playerName ?? result?.alias;
                              const fallbackKey = `result-${index}`;
                              const profileKey = buildFavoriteKey(result.profileId, aliasForKey, fallbackKey) ?? fallbackKey;
                              const sortedMatches = (result.recentMatches || [])
                                .slice()
                                .sort((a: any, b: any) => (
                                  (b.endTime ?? b.startTime ?? 0) - (a.endTime ?? a.startTime ?? 0)
                                ));
                              const maxMatches = Math.min(100, sortedMatches.length);
                              const baseLimit = recentMatchLimits[profileKey] ?? DEFAULT_RECENT_MATCH_LIMIT;
                              const currentLimit = maxMatches > 0 ? Math.min(baseLimit, maxMatches) : Math.min(baseLimit, DEFAULT_RECENT_MATCH_LIMIT);
                              const visibleMatches = sortedMatches.slice(0, Math.min(currentLimit, maxMatches));
                              const canLoadMore = currentLimit < maxMatches;
                              const remainingMatches = Math.max(0, maxMatches - currentLimit);
                              const loadMoreCount = Math.min(10, remainingMatches || 10);

                              const handleLoadMore = () => {
                                if (!canLoadMore) return;
                                setRecentMatchLimits(prev => {
                                  const prevLimit = prev[profileKey] ?? DEFAULT_RECENT_MATCH_LIMIT;
                                  const nextLimit = Math.min(prevLimit + 10, maxMatches);
                                  return {
                                    ...prev,
                                    [profileKey]: nextLimit,
                                  };
                                });
                              };

                              return (
                                <>
                                  <div className="grid gap-2">
                                    {visibleMatches.map((m: any, mi: number) => {
                                      const myTeam = m.teamId;
                                      const allies = (m.players || []).filter((p: any) => p.teamId === myTeam && p.profileId !== result.profileId);
                                      const opps = (m.players || []).filter((p: any) => p.teamId !== myTeam);
                                      const outcomeColor = m.outcome === 'Win' ? 'text-green-400' : m.outcome === 'Loss' ? 'text-red-400' : 'text-neutral-300';
                                      const diffColor = (m.ratingDiff ?? 0) > 0 ? 'text-green-400' : (m.ratingDiff ?? 0) < 0 ? 'text-red-400' : 'text-neutral-400';
                                      const matchType = formatMatchTypeLabel(m.matchTypeId);
                                      const isAutomatch = typeof m.matchTypeId === 'number' && m.matchTypeId >= 1 && m.matchTypeId <= 4;
                                      const start = m.startTime ? new Date(m.startTime * 1000) : undefined;
                                      const duration = typeof m.durationSec === 'number' ? m.durationSec : undefined;
                                      const durStr = duration !== undefined ? `${Math.floor(duration/60)}m${duration%60 ? ' ' + (duration%60) + 's' : ''}` : '';
                                      const mePlayer = (m.players || []).find((p: any) => p.profileId === result.profileId);
                                      const myFaction = raceIdToFaction(m.raceId ?? mePlayer?.raceId);
                                      const rawMapIdCandidate = [m.mapName, m.mapname, m.mapId, m.mapid]
                                        .find((value) => {
                                          if (typeof value === 'string') {
                                            return value.trim().length > 0;
                                          }
                                          if (typeof value === 'number') {
                                            return Number.isFinite(value);
                                          }
                                          return false;
                                        });
                                      const normalizedMapId = typeof rawMapIdCandidate === 'number'
                                        ? String(rawMapIdCandidate)
                                        : rawMapIdCandidate?.trim();
                                      const mapDisplayName = getMapName(normalizedMapId);
                                      const mapImagePath = getMapImage(normalizedMapId);
                                      const hasRoster = allies.length > 0 || opps.length > 0;
                                      const displaySelfAlias = mePlayer?.alias || result.playerName || String(result.profileId);
                                      const teamExtraCount = Math.max(0, allies.length - 2);
                                      const opponentExtraCount = Math.max(0, opps.length - 3);
                                      const selfRating = typeof m.newRating === 'number' ? m.newRating : (typeof m.oldRating === 'number' ? m.oldRating : undefined);

                                      const teamEntries: RosterEntry[] = [
                                        {
                                          key: `self-${result.profileId}`,
                                          label: displaySelfAlias,
                                          faction: myFaction,
                                          rating: isAutomatch ? selfRating : undefined,
                                          onClick: displaySelfAlias ? () => runSearchByName(displaySelfAlias, String(result.profileId)) : undefined,
                                        },
                                        ...allies.slice(0, 2).map((p: any, index: number) => {
                                          const label = p.alias || String(p.profileId);
                                          const faction = raceIdToFaction(p.raceId);
                                          const playerRating = typeof p?.newRating === 'number' ? p.newRating : (typeof p?.oldRating === 'number' ? p.oldRating : undefined);
                                          return {
                                            key: `ally-${p.profileId}-${index}`,
                                            label,
                                            faction,
                                            rating: isAutomatch ? playerRating : undefined,
                                            onClick: p.alias ? () => runSearchByName(p.alias, String(p.profileId)) : undefined,
                                          } satisfies RosterEntry;
                                        }),
                                      ];

                                      const opponentEntries: RosterEntry[] = opps.slice(0, 3).map((p: any, index: number) => {
                                        const label = p.alias || String(p.profileId);
                                        const faction = raceIdToFaction(p.raceId);
                                        const playerRating = typeof p?.newRating === 'number' ? p.newRating : (typeof p?.oldRating === 'number' ? p.oldRating : undefined);
                                        return {
                                          key: `opp-${p.profileId}-${index}`,
                                          label,
                                          faction,
                                          rating: isAutomatch ? playerRating : undefined,
                                          onClick: p.alias ? () => runSearchByName(p.alias) : undefined,
                                        } satisfies RosterEntry;
                                      });

                                      const renderRosterEntries = (
                                        entries: RosterEntry[],
                                        extraCount: number,
                                        align: 'start' | 'end' = 'start'
                                      ) => (
                                        <div
                                          className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-neutral-200 ${
                                            align === 'end' ? 'sm:justify-end' : ''
                                          }`}
                                        >
                                          {entries.map((entry, index) => (
                                            <Fragment key={entry.key || `${entry.label}-${index}`}>
                                              {index > 0 && <span className="text-neutral-500 select-none">•</span>}
                                              <button
                                                type="button"
                                                onClick={entry.onClick}
                                                className={`hover:underline ${
                                                  entry.onClick ? 'text-blue-300' : 'text-neutral-400 cursor-default'
                                                }`}
                                                title={typeof entry.rating === 'number' ? `${entry.label} (${entry.rating})` : entry.label}
                                                disabled={!entry.onClick}
                                              >
                                                {entry.label}
                                                {typeof entry.rating === 'number' && (
                                                  <span className="ml-1 text-neutral-400 whitespace-nowrap">
                                                    {entry.rating}
                                                  </span>
                                                )}
                                                {entry.faction !== 'Unknown' && (
                                                  <span className={`ml-1 ${getFactionColor(entry.faction)} inline-flex items-center`}>
                                                    (
                                                    <FactionLogo faction={entry.faction} size={11} yOffset={0} className="mx-1" />
                                                    <span>{entry.faction}</span>
                                                    )
                                                  </span>
                                                )}
                                              </button>
                                            </Fragment>
                                          ))}
                                          {extraCount > 0 && (
                                            <Fragment>
                                              {entries.length > 0 && <span className="text-neutral-500 select-none">•</span>}
                                              <span className="text-neutral-400">+{extraCount}</span>
                                            </Fragment>
                                          )}
                                        </div>
                                      );

                                      return (
                                        <div key={mi} className="text-xs bg-neutral-900 border border-neutral-600/25 p-2 rounded shadow-md">
                                          <div className="flex items-stretch gap-3">
                                            <div className="relative h-14 w-14 flex-shrink-0 self-center sm:h-16 sm:w-16">
                                              <div className="absolute inset-0 rounded-lg bg-neutral-800/60 shadow-inner" aria-hidden />
                                              {mapImagePath ? (
                                                <img
                                            src={mapImagePath}
                                            alt={`${mapDisplayName} mini-map`}
                                            className="relative h-full w-full rotate-45 transform-gpu rounded-lg border border-neutral-600/50 object-cover shadow-lg"
                                            draggable={false}
                                          />
                                        ) : (
                                          <div className="relative flex h-full w-full rotate-45 transform-gpu items-center justify-center rounded-lg border border-dashed border-neutral-600/50 bg-neutral-800/40 text-[0.55rem] font-semibold uppercase tracking-wide text-neutral-500 shadow-lg">
                                            <span className="-rotate-45 select-none">No Map</span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 pl-0.5 sm:pl-1">
                                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                            <span className={`${outcomeColor} font-semibold`}>{m.outcome || 'Unknown'}</span>
                                            <span className="text-neutral-500">•</span>
                                            <span className="text-white truncate" title={mapDisplayName}>{mapDisplayName}</span>
                                            <span className="text-neutral-500">•</span>
                                            <span className="text-orange-300">{matchType}</span>
                                            {start && (
                                              <>
                                                <span className="text-neutral-500">•</span>
                                                <span className="text-neutral-400">{formatLastMatch(start)}</span>
                                              </>
                                            )}
                                            {durStr && (
                                              <>
                                                <span className="text-neutral-500">•</span>
                                                <span className="text-neutral-400">{durStr}</span>
                                              </>
                                            )}
                                          </div>
                                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                            {typeof m.oldRating === 'number' && typeof m.newRating === 'number' && (
                                              <span className="text-neutral-300">{m.oldRating}→{m.newRating}</span>
                                            )}
                                            {typeof m.ratingDiff === 'number' && (
                                              <span className={`font-semibold ${diffColor}`}>{m.ratingDiff > 0 ? `+${m.ratingDiff}` : m.ratingDiff}</span>
                                            )}
                                          </div>
                                        </div>
                                        {hasRoster && (
                                          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-3">
                                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                              <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wide">Team</span>
                                              {renderRosterEntries(teamEntries, teamExtraCount, 'start')}
                                            </div>
                                            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:items-end">
                                              <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wide sm:text-right">Opponents</span>
                                              <div className="w-full sm:w-auto">
                                                {renderRosterEntries(opponentEntries, opponentExtraCount, 'end')}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                                  </div>
                                  {maxMatches > 0 && (
                                    canLoadMore ? (
                                      <div className="mt-3 flex justify-center">
                                        <button
                                          type="button"
                                          onClick={handleLoadMore}
                                          className="inline-flex items-center justify-center rounded-md border border-neutral-600/40 bg-neutral-800/70 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-neutral-700/70 disabled:cursor-not-allowed disabled:opacity-50"
                                          disabled={!canLoadMore}
                                        >
                                          Load {loadMoreCount} more matches
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="mt-3 text-center text-xs text-neutral-400">
                                        All {maxMatches} recent matches loaded
                                      </div>
                                    )
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                <div className="mt-4 text-sm text-neutral-300 bg-neutral-900/40 border border-neutral-700/40 rounded-md p-4">
                  <span className="font-semibold text-white">No Results.</span>{' '}
                  <span>
                    Hint: enter the exact name you are using in your multiplayer profile. It&apos;s case-sensitive.
                  </span>
                  {searchUpdatedAt && (
                    <div className="mt-2 text-xs text-neutral-400">
                      Last updated: {formatTimestamp(searchUpdatedAt) ?? 'Unknown'}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Favourites Tab Content */}
        {activeTab === 'favorites' && (
          <div className="bg-neutral-900 border border-neutral-600/40 rounded-lg p-4 sm:p-6 shadow-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Favourites</h2>
                <p className="text-sm text-neutral-400">Star players in search results to track them here.</p>
              </div>
              {favoriteEntries.length > 0 && (
                <span className="text-xs text-neutral-500">Stored securely in your browser cookies.</span>
              )}
            </div>

            {favoriteEntries.length === 0 ? (
              <div className="text-sm text-neutral-300 bg-neutral-800/60 border border-neutral-700/40 rounded-md p-4">
                <p className="font-semibold text-white mb-1">No favourites yet.</p>
                <p>Use the star icon next to a player in search results to add them.</p>
              </div>
            ) : (
              <div className="grid gap-4 grid-cols-1">
                {favoriteEntries.map(entry => {
                  const dataEntry = favoriteData[entry.key];
                  const result = dataEntry?.result;
                  const error = dataEntry?.error;
                  const loadingEntry = favoritesLoading && !dataEntry;
                  const profile = result?.personalStats?.profile;
                  const displayName = result?.playerName || profile?.alias || entry.playerName || entry.alias;
                  const countryCode = profile?.country || entry.country;
                  const xp = typeof profile?.xp === 'number' ? profile.xp : undefined;
                  const level = xp ? getLevelFromXP(xp) : undefined;
                  const lastUpdated = result?.lastUpdated;
                  const isFavorite = Boolean(favorites[entry.key]);
                  const errorMessage = error === 'not_found'
                    ? 'No stats available for this player yet.'
                    : 'Failed to load latest stats.';

                  return (
                    <div key={entry.key} className="bg-neutral-800 border border-neutral-600/30 rounded-lg p-4 shadow-lg">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-white font-medium">{displayName}</h4>
                          {countryCode && (
                            <div className="flex items-center gap-1">
                              <FlagIcon countryCode={countryCode} />
                            </div>
                          )}
                          {typeof level === 'number' && (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-neutral-400">Level</span>
                              <span className="text-white">{level}</span>
                            </div>
                          )}
                          {typeof xp === 'number' && (
                            <div className="flex items-center gap-1 text-xs">
                              <span className="text-neutral-400">XP</span>
                              <span className="text-white">{xp.toLocaleString?.() || xp}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end items-start gap-2 sm:gap-3 sm:text-right">
                          {lastUpdated && (
                            <span className="text-xs text-neutral-400 text-left sm:text-right">
                              Last updated: {formatTimestamp(lastUpdated) ?? 'Unknown'}
                            </span>
                          )}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleFavorite({
                                profileId: entry.profileId,
                                alias: entry.alias,
                                playerName: entry.playerName,
                                country: entry.country,
                              })}
                              className={`inline-flex items-center justify-center rounded-full border border-neutral-600/40 px-3 py-1 transition ${
                                isFavorite
                                  ? 'text-yellow-400 bg-neutral-800/70'
                                  : 'text-neutral-300 hover:text-yellow-300 hover:bg-neutral-800/40'
                              }`}
                              aria-pressed={isFavorite}
                              title={isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                            >
                              <svg
                                className="w-4 h-4"
                                viewBox="0 0 24 24"
                                fill={isFavorite ? 'currentColor' : 'none'}
                                stroke="currentColor"
                                strokeWidth={isFavorite ? 1 : 1.5}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.317 4.043a1 1 0 00.95.69h4.268c.969 0 1.371 1.24.588 1.81l-3.453 2.507a1 1 0 00-.364 1.118l1.317 4.043c.3.921-.755 1.688-1.54 1.118L12 15.347l-3.534 2.609c-.784.57-1.838-.197-1.539-1.118l1.317-4.043a1 1 0 00-.364-1.118L4.427 9.47c-.783-.57-.38-1.81.588-1.81h4.268a1 1 0 00.95-.69l1.317-4.043z" />
                              </svg>
                              <span className="ml-2 hidden text-xs font-semibold sm:inline">
                                {isFavorite ? 'Remove favourite' : 'Add to favourite'}
                              </span>
                            </button>
                          <button
                            type="button"
                            onClick={() => runSearchByName(entry.alias, entry.profileId)}
                            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-neutral-800/70 hover:bg-neutral-700/70 text-white rounded-md border border-neutral-600/40 transition-colors text-xs font-semibold"
                          >
                            View in Search
                          </button>
                          {entry.profileId && (
                            <button
                              type="button"
                              onClick={() => handleOpenAdvancedStats({
                                alias: entry.alias,
                                profileId: entry.profileId,
                                playerName: entry.playerName,
                              })}
                              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 rounded-md border border-yellow-500/40 transition-colors text-xs font-semibold"
                            >
                              View advanced statistics
                            </button>
                          )}
                          </div>
                        </div>
                      </div>

                      {loadingEntry && (
                        <div className="text-xs text-neutral-400 bg-neutral-800/60 border border-neutral-700/40 rounded-md px-3 py-2">
                          Loading latest stats…
                        </div>
                      )}

                      {!loadingEntry && error && (
                        <div className="mt-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-red-300 bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
                          <span className="sm:text-left text-center w-full sm:w-auto">{errorMessage}</span>
                          <button
                            type="button"
                            onClick={() => refreshFavorite(entry.key)}
                            className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-red-800/60 hover:bg-red-700/60 text-red-100 rounded-md border border-red-600/40 transition-colors"
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {result && renderLeaderboardStatsBlock(result.personalStats?.leaderboardStats, 3)}

                      {entry.profileId && activeAdvancedStats?.profileId === entry.profileId && (
                        <div className="mt-4">
                          <AdvancedStatsPanel
                            profileId={entry.profileId}
                            alias={entry.alias}
                            onRequestAccess={premiumTeaserEnabled ? () => handleOpenPremiumPrompt({
                              alias: entry.alias,
                              profileId: entry.profileId,
                              playerName: entry.playerName,
                            }) : undefined}
                            variant="embedded"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'replays' && (
          <ReplaysTab
            onPlayerClick={async (playerName: string, profileId?: string) => {
              // Switch to search tab and search for the player
              setActiveTab('search');
              setSearchQuery(playerName);

              // Trigger the search
              await handlePlayerSearch(playerName, { pushHistory: true });
            }}
          />
        )}


        {/* Support Tab Content */}
        {activeTab === 'support' && (
          <div id="support" className="bg-neutral-900 border border-neutral-600/40 rounded-lg p-6 sm:p-8 shadow-2xl text-center space-y-4">
            <h2 className="text-2xl font-bold text-white">Support the Chapter</h2>
            <p className="text-neutral-300">
              May these tactical readouts aid your crusade. A modest tithe keeps the machine-spirits purring, the data flowing, and new wargear (features) in the forge.
            </p>
            <p className="text-neutral-400 text-sm">
              The Emperor protects, your support sustains.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <SupportButton className="w-full sm:w-auto" />
            </div>
          </div>
        )}
      </div>
      <footer className="border-t border-neutral-800/70 bg-neutral-900/90 backdrop-blur-sm">
        <div className="container mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <div className="grid gap-8 text-sm text-neutral-300 md:grid-cols-[2fr_1fr] lg:grid-cols-[2fr_1fr_1fr]">
            <div className="space-y-3 leading-relaxed">
              <p className="text-base font-semibold tracking-wide text-white">
                Dawn of War: Definitive Edition Leaderboards &amp; Player Stats
              </p>
              <p className="text-neutral-400">
                Monitor competitive Dawn of War ladder rankings, faction win rates, and player match histories in real time. Analyze commanders, review ELO trends, and study meta shifts across Chaos, Eldar, Space Marines, Tau, and more.
              </p>
              <p className="text-neutral-400">
                Dedicated coverage of the global 1v1 Dawn of War leaderboard, 2v2 through 4v4 ladders, and community meta reports keeps you battle ready with tournament-grade statistics, matchup breakdowns, and balance insights.
              </p>
              <p className="text-neutral-400">
                Use the searchable Dawn of War leaderboards to scout opponents, compare ladder positions, and download historical statistics before your next ranked match.
              </p>
              <div className="text-neutral-400">
                <span>Consider supporting to cover costs for this free community website.{' '}</span>
                <button
                  type="button"
                  onClick={handleSupportLink}
                  className="font-semibold text-blue-300 transition hover:text-blue-200"
                >
                  Go to Support
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Quick Access
              </span>
              <div className="grid gap-2 text-neutral-300">
                <button
                  type="button"
                  onClick={() => activateTabFromFooter('leaderboards')}
                  className="w-fit text-left transition hover:text-white"
                >
                  Dawn of War Ladder Overview
                </button>
                <button
                  type="button"
                  onClick={() => activateTabFromFooter('search')}
                  className="w-fit text-left transition hover:text-white"
                >
                  Player Search & Statistics Portal
                </button>
                <button
                  type="button"
                  onClick={handleSupportLink}
                  className="w-fit text-left transition hover:text-white"
                >
                  Support & Hosting Options
                </button>
                <a
                  href="https://github.com/EnzeD/dow-leaderboards"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit transition hover:text-white"
                >
                  Project GitHub Repository
                </a>
                <button
                  onClick={() => setShowFeedbackModal(true)}
                  className="w-fit text-left transition hover:text-white"
                >
                  Community Feedback Thread
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Community &amp; Credits
              </span>
              <p className="leading-relaxed text-neutral-400">
                Crafted by{' '}
                <a
                  href="https://nicolas-zullo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-white transition hover:text-blue-200"
                >
                  Nicolas Zullo
                </a>{' '}
                and{' '}
                <a
                  href="https://github.com/EnzeD/dow-leaderboards/graphs/contributors"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-blue-300 transition hover:text-blue-200"
                >
                  public contributors
                </a>{' '}
                keeping the Adeptus Astartes community informed with accurate Dawn of War data.
              </p>
              <p className="leading-relaxed text-neutral-400">
                Explore long-form Dawn of War ladder analysis, balance discussions, and statistics archives curated by the community to help you conquer ranked seasons and tournament brackets.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="https://nicolas-zullo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full border border-neutral-700/70 px-3 py-1.5 text-neutral-200 transition hover:border-neutral-400 hover:text-white"
                >
                  <span className="text-xs font-semibold uppercase tracking-[0.25em]">Portfolio</span>
                </a>
                <a
                  href="https://x.com/NicolasZu"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700/80 bg-neutral-900/80 transition hover:border-neutral-400"
                  aria-label="Follow Nicolas Zullo on X"
                >
                  <img
                    src="https://upload.wikimedia.org/wikipedia/commons/c/ce/X_logo_2023.svg"
                    alt="X Logo"
                    className="h-4 w-4"
                    loading="lazy"
                    style={{ filter: 'invert(1)' }}
                  />
                </a>
              </div>
            </div>
      </div>
    </div>
  </footer>
  {premiumTeaserEnabled && premiumPromptContext && (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="premium-survey-title"
    >
      <div className="relative w-full max-w-lg rounded-2xl border border-yellow-500/30 bg-neutral-950/95 p-6 shadow-2xl">
        <button
          type="button"
          onClick={handleClosePremiumPrompt}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700/60 bg-neutral-900/80 text-neutral-400 transition hover:border-neutral-500 hover:text-white"
          aria-label="Close advanced statistics notice"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        </button>
        <div className="space-y-4 pr-2">
          <div className="flex items-center gap-3">
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
            <div>
              <h3 id="premium-survey-title" className="text-lg font-semibold text-white">Advanced statistics</h3>
              <p className="text-xs text-neutral-400">{premiumPromptContext.playerName ?? premiumPromptContext.alias}</p>
            </div>
          </div>
          <div className="space-y-3 text-sm text-neutral-200">
            <p>Advanced statistics is not available yet.</p>
            <p>Today it&apos;s not possible to display them with the Relic API alone, we need to set up bots, background jobs, and functions that cost some money.</p>
            <p>This website stays free for everyone, so any participation would also help keep the hosting running, which is greatly appreciated!</p>
            <p>Would you be interested in unlocking the advanced stats against a small price?</p>
          </div>
          <div className="flex flex-col gap-2">
            {PREMIUM_PRICE_OPTIONS.map((option) => {
              const isSelected = premiumPromptChoice === option;
              const detail = PREMIUM_PRICE_DETAIL[option];
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => handlePremiumSurveySelection(option)}
                  disabled={premiumPromptLoading}
                  className={`flex flex-col items-start gap-1 rounded-lg border px-4 py-2 text-left text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-yellow-400 ${
                    isSelected
                      ? 'border-yellow-400 bg-yellow-400 text-neutral-900'
                      : 'border-neutral-700/60 bg-neutral-900/70 text-neutral-100 hover:border-yellow-400/70 hover:text-white'
                  } ${premiumPromptLoading ? 'opacity-70' : ''}`}
                  aria-pressed={isSelected}
                >
                  <span className="flex w-full items-center justify-between">
                    <span>{option}</span>
                    {isSelected && (
                      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3.5 8.5l2.5 2.5 6-6" />
                      </svg>
                    )}
                  </span>
                  {detail && (
                    <span className={`text-xs font-normal ${isSelected ? 'text-neutral-900/80' : 'text-neutral-400'}`}>
                      {detail}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {premiumPromptError && (
            <p className="text-xs font-semibold text-red-400">{premiumPromptError}</p>
          )}
          {premiumPromptChoice && (
            <div className="rounded-lg border border-neutral-700/60 bg-neutral-900/60 p-4">
              <p className="text-xs text-neutral-300">Drop your email and we&apos;ll notify you the moment advanced statistics go live.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <input
                  type="email"
                  value={premiumEmailValue}
                  onChange={(event) => {
                    setPremiumEmailValue(event.target.value);
                    if (premiumEmailStatus === 'error') {
                      setPremiumEmailStatus('idle');
                      setPremiumEmailError(null);
                    }
                  }}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-neutral-700/60 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-yellow-400 focus:outline-none focus:ring-1 focus:ring-yellow-400"
                  disabled={premiumEmailStatus === 'loading' || premiumEmailStatus === 'success'}
                  aria-label="Email address"
                />
                <button
                  type="button"
                  onClick={handlePremiumEmailSubmit}
                  disabled={premiumEmailStatus === 'loading' || premiumEmailStatus === 'success'}
                  className="inline-flex items-center justify-center rounded-md border border-yellow-400/40 bg-yellow-400 px-3 py-2 text-sm font-semibold text-neutral-900 transition hover:bg-yellow-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {premiumEmailStatus === 'loading' ? 'Saving...' : premiumEmailStatus === 'success' ? 'Saved' : 'Notify me'}
                </button>
              </div>
              {premiumEmailError && (
                <p className="mt-2 text-xs font-semibold text-red-400">{premiumEmailError}</p>
              )}
              {premiumEmailStatus === 'success' && !premiumEmailError && (
                <p className="mt-2 text-xs text-green-400">Thanks! We&apos;ll keep you posted.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )}
  {/* Feedback Modal */}
  {showFeedbackModal && (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feedback-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          setShowFeedbackModal(false);
        }
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl border border-neutral-700/50 bg-neutral-950/95 p-6 shadow-2xl">
        <button
          type="button"
          onClick={() => setShowFeedbackModal(false)}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700/60 bg-neutral-900/80 text-neutral-400 transition hover:border-neutral-500 hover:text-white"
          aria-label="Close feedback modal"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 6l12 12" />
            <path d="M18 6L6 18" />
          </svg>
        </button>

        <div className="space-y-4">
          <h3 id="feedback-modal-title" className="text-lg font-semibold text-white">Provide feedback</h3>
          <p className="text-sm text-neutral-300">Join the discussion and share your feedback on these platforms:</p>

          <div className="space-y-3">
            <a
              href="https://steamcommunity.com/app/3556750/discussions/0/673972930560257123/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border border-neutral-700/50 bg-neutral-900/60 px-4 py-3 text-neutral-100 transition-all duration-200 hover:border-neutral-500 hover:bg-neutral-800/70 hover:text-white"
              onClick={() => setShowFeedbackModal(false)}
            >
              <div className="flex items-center gap-3">
                <img
                  src="/assets/steam-logo.svg"
                  alt="Steam"
                  className="h-5 w-5"
                />
                <span className="font-medium">Steam Discussions</span>
              </div>
              <svg className="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            <a
              href="https://www.reddit.com/r/dawnofwar/comments/1nguikt/i_built_a_dawn_of_war_definitive_edition/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between rounded-lg border border-neutral-700/50 bg-neutral-900/60 px-4 py-3 text-neutral-100 transition-all duration-200 hover:border-neutral-500 hover:bg-neutral-800/70 hover:text-white"
              onClick={() => setShowFeedbackModal(false)}
            >
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
                </svg>
                <span className="font-medium">Reddit Thread</span>
              </div>
              <svg className="h-4 w-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>

            <div className="rounded-lg border border-neutral-700/50 bg-neutral-900/60 p-4">
              <div className="mb-2 flex items-center gap-3">
                <svg className="h-5 w-5 text-indigo-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057a19.9 19.9 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.839 19.839 0 0 0 6.002-3.03a.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                <span className="font-medium text-white">Official Relic Discord</span>
              </div>
              <div className="flex flex-col gap-2 text-sm">
                <a
                  href="https://discord.com/channels/722144726421209089/1417154758052941926"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded border border-neutral-700/40 bg-neutral-800/50 px-3 py-2 text-neutral-200 transition-all hover:border-neutral-500 hover:bg-neutral-800/70 hover:text-white"
                  onClick={() => setShowFeedbackModal(false)}
                >
                  <span className="text-sm">Go to feedback channel</span>
                  <svg className="h-3.5 w-3.5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
                <a
                  href="https://discord.gg/UjhKnHajje"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between rounded border border-indigo-600/30 bg-indigo-900/20 px-3 py-2 text-indigo-200 transition-all hover:border-indigo-500/50 hover:bg-indigo-900/30 hover:text-indigo-100"
                  onClick={() => setShowFeedbackModal(false)}
                >
                  <span className="text-sm">Join the server first</span>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )}
</div>
);
}
