"use client";

import { useState, useEffect, Fragment } from "react";
import SupportButton from "@/app/_components/SupportButton";
import { LadderRow, Leaderboard } from "@/lib/relic";
import { getMapName, getMapImage } from "@/lib/mapMetadata";
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
    'Eldar': 'text-blue-400',
    'Dark Eldar': 'text-purple-400',
    'Ork': 'text-green-400',
    'Space Marine': 'text-blue-300',
    'Chaos Marine': 'text-red-400',
    'Imperial Guard': 'text-yellow-400',
    'Necron': 'text-emerald-300',
    'Tau': 'text-cyan-400',
    'Sisters of Battle': 'text-pink-400'
  };
  return factionColors[faction] || 'text-orange-300';
};

// Map faction → icon path (bundled)
const FACTION_ICON_MAP: Record<string, StaticImageData | string> = {
  'Chaos Marine': chaosIcon,
  'Dark Eldar': darkEldarIcon,
  'Eldar': eldarIcon,
  'Imperial Guard': imperialGuardIcon,
  'Necron': necronIcon,
  'Ork': orkIcon,
  'Sisters of Battle': sistersIcon,
  'Space Marine': spaceMarineIcon,
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

const RACE_ID_TO_FACTION: Record<number, string> = {
  0: 'Chaos Marine',
  1: 'Dark Eldar',
  2: 'Eldar',
  3: 'Imperial Guard',
  4: 'Necron',
  5: 'Ork',
  6: 'Sisters of Battle',
  7: 'Space Marine',
  8: 'Tau',
};

// Map raceId from match history to faction name as defined by relic API payloads
const raceIdToFaction = (raceId?: number): string => {
  if (raceId === undefined || raceId === null || raceId < 0) return 'Unknown';
  return RACE_ID_TO_FACTION[raceId] || 'Unknown';
};

// Get rank color based on position
const getRankColor = (rank: number): string => {
  if (rank <= 5) return 'text-yellow-400'; // Gold for top 5
  if (rank <= 10) return 'text-yellow-300'; // Light gold for top 10
  if (rank <= 25) return 'text-orange-400'; // Orange for top 25
  return 'text-red-400'; // Red for others
};

// Tab types
type TabType = 'leaderboards' | 'search' | 'favorites' | 'support';

export default function Home() {
  type AppState = {
    view: 'leaderboards' | 'search' | 'favorites' | 'support';
    searchQuery?: string;
    selectedFaction?: string;
    selectedMatchType?: string;
    selectedCountry?: string;
    selectedId?: number;
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
      // no 'tab' param for default view
    } else if (state.view === 'search') {
      p.set('tab', 'search');
      if (state.searchQuery) p.set('q', state.searchQuery);
    } else if (state.view === 'favorites') {
      p.set('tab', 'favorites');
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
      return { view: 'search', searchQuery: q };
    }
    if (tab === 'favorites') {
      return { view: 'favorites' };
    }
    if (tab === 'support') {
      return { view: 'support' };
    }
    const match = p.get('match') || '1v1';
    const faction = p.get('faction') || 'All factions';
    const country = p.get('country') || 'Global';
    return {
      view: 'leaderboards',
      selectedMatchType: match,
      selectedFaction: faction,
      selectedCountry: country,
    };
  };
  const [activeTab, setActiveTab] = useState<TabType>('leaderboards');
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [selectedId, setSelectedId] = useState<number>(1);
  const [ladderData, setLadderData] = useState<LadderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof LadderRow>("rank");
  const [sortDesc, setSortDesc] = useState(false);

  // Search tab state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLastUpdated, setSearchLastUpdated] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [combinedLimit, setCombinedLimit] = useState<number>(200);
  const [lbExpanded, setLbExpanded] = useState(false);
  const [recentMatchLimits, setRecentMatchLimits] = useState<Record<string, number>>({});
  const [favorites, setFavorites] = useState<Record<string, FavoriteEntry>>({});
  const [favoriteData, setFavoriteData] = useState<Record<string, FavoriteDataEntry>>({});
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  // Live Steam player count (DoW:DE)
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

  useEffect(() => {
    if (matchTypes.length === 0) return;
    if (!matchTypes.includes(selectedMatchType)) {
      setSelectedMatchType(matchTypes[0]);
    }
  }, [matchTypes, selectedMatchType]);

  // Load leaderboards on mount
  useEffect(() => {
    fetch("/api/leaderboards")
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
      // kick off search on first load if q is present
      if (initialFromUrl.searchQuery) {
        try {
          // run without pushing history
          handlePlayerSearch(initialFromUrl.searchQuery, { pushHistory: false });
        } catch {}
      }
    } else if (initialFromUrl.view === 'leaderboards') {
      setActiveTab('leaderboards');
      if (typeof initialFromUrl.selectedMatchType === 'string') setSelectedMatchType(initialFromUrl.selectedMatchType);
      if (typeof initialFromUrl.selectedFaction === 'string') setSelectedFaction(initialFromUrl.selectedFaction);
      if (typeof initialFromUrl.selectedCountry === 'string') setSelectedCountry(initialFromUrl.selectedCountry);
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
    };
    syncUrl(initialState);

    const onPopState = (e: PopStateEvent) => {
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

    const fallback = leaderboards.find(lb => lb.matchType === selectedMatchType && lb.faction && lb.faction !== 'Unknown');
    if (fallback?.faction && fallback.faction !== selectedFaction) {
      setSelectedFaction(fallback.faction);
    }
  }, [selectedMatchType, leaderboards, selectedFaction, availableFactions]);

  // Update selected ID when filters change OR when leaderboards first load
  useEffect(() => {
    if (filteredLeaderboards.length === 0) return;
    const newId = filteredLeaderboards[0].id;
    if (newId !== selectedId) {
      setSelectedId(newId);
    }
  }, [filteredLeaderboards, selectedId]);

  // Load ladder when selection changes
  useEffect(() => {
    if (isCombinedMode) {
      // Fetch combined 1v1 data (CDN cached)
      setLoading(true);
      fetch(`/api/cache/combined-1v1/${combinedLimit}`)
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
      fetch(`/api/cache/leaderboard/${selectedId}`)
        .then(r => r.json())
        .then(data => {
          setLadderData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [selectedId, isCombinedMode, combinedLimit]);

  const handleSort = (field: keyof LadderRow) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(field === "playerName"); // desc for strings
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
    const aVal = a[sortField];
    const bVal = b[sortField];
    let comparison = 0;

    if (typeof aVal === "string" && typeof bVal === "string") {
      comparison = aVal.localeCompare(bVal);
    } else if (aVal instanceof Date && bVal instanceof Date) {
      comparison = aVal.getTime() - bVal.getTime();
    } else if (sortField === "lastMatchDate") {
      // Special handling for date field
      const aTime = aVal instanceof Date ? aVal.getTime() : 0;
      const bTime = bVal instanceof Date ? bVal.getTime() : 0;
      comparison = aTime - bTime;
    } else {
      comparison = (aVal as number) - (bVal as number);
    }

    return sortDesc ? -comparison : comparison;
  });

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
      fetch(`/api/cache/leaderboard/${selectedId}/1000`)
        .then(r => r.json())
        .then(data => {
          setLadderData(data);
        })
        .catch(() => {});
    }
  }, [search, ladderData, isCombinedMode, combinedLimit, selectedId, lbExpanded]);

  // Reset expansion flag when filters change or user clears search
  useEffect(() => {
    setLbExpanded(false);
  }, [selectedMatchType, selectedFaction, selectedCountry, selectedId, activeTab]);

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
        fetch(`/api/cache/leaderboard/${selectedId}`)
          .then(r => r.json())
          .then(data => setLadderData(data))
          .catch(() => {});
      } finally {
        setLbExpanded(false);
      }
    }
  }, [search, isCombinedMode, combinedLimit, selectedId, lbExpanded]);

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
      const response = await fetch(`/api/cache/player/by-alias/${encodeURIComponent(q)}`);
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

  // Keep URL in sync as state changes (without pushing)
  useEffect(() => {
    const state: AppState = {
      view: activeTab,
      searchQuery,
      selectedFaction,
      selectedMatchType,
      selectedCountry,
      selectedId,
    };
    syncUrl(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchQuery, selectedFaction, selectedMatchType, selectedCountry, selectedId]);

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
  const runSearchByName = async (name: string) => {
    const q = (name || '').trim();
    if (!q) return;
    await handlePlayerSearch(q, { pushHistory: true });
  };

  const searchUpdatedAt: string | null = (() => {
    const firstWithTimestamp = searchResults.find(result => typeof (result as any)?.lastUpdated === 'string') as { lastUpdated?: string } | undefined;
    if (firstWithTimestamp?.lastUpdated) return firstWithTimestamp.lastUpdated;
    return searchLastUpdated;
  })();

  const favoriteEntries = Object.values(favorites);

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
            return (
              <div key={`${s.leaderboardId}-${appIndex}`} className="text-xs bg-neutral-900 border border-neutral-600/25 p-2 rounded shadow-md">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-1 rounded hover:bg-neutral-800/30 transition-all duration-200">
                  <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto">
                    <span className={`${getFactionColor(faction)} inline-flex items-center`}>
                      <FactionLogo faction={faction} size={12} yOffset={0} />
                    </span>
                    <span className="text-orange-300 truncate" title={name}>
                      {faction} {type}
                    </span>
                    <span className="text-neutral-400 hidden sm:inline">•</span>
                    <span className="text-neutral-300 truncate hidden sm:inline" title={name}>{name}</span>
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

  // Fetch and poll current Steam player count (every 5 minutes)
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setPlayerCountLoading(true);
      fetch('/api/steam/players', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          if (cancelled) return;
          const count = typeof data?.playerCount === 'number' ? data.playerCount : null;
          setPlayerCount(count);
          setPlayerCountLoading(false);
        })
        .catch(() => {
          if (cancelled) return;
          setPlayerCount(null);
          setPlayerCountLoading(false);
        });
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <div className="min-h-screen text-white">
      <div className="container mx-auto px-3 py-4 sm:px-6 sm:py-6 max-w-7xl">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          {/* Mobile Header */}
          <div className="flex flex-col sm:hidden items-center text-center mb-4">
            <div className="mb-3">
              <img
                src="/assets/daw-logo.webp"
                alt="Dawn of War: Definitive Edition"
                className="h-12 w-auto object-contain mx-auto"
              />
            </div>
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-xl font-bold text-white leading-tight px-4">
                Dawn of War: Definitive Edition Leaderboards
              </h1>
              <span className="px-2 py-1 bg-red-600 text-white text-xs font-semibold rounded-md">
                BETA
              </span>
              <div className="mt-1 inline-flex items-center px-2 py-1 bg-neutral-800/60 border border-neutral-600/50 rounded-md shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" aria-hidden></span>
                <span className="text-[11px] text-neutral-300">Players</span>
                <span className="ml-1.5 text-[11px] font-semibold text-white">
                  {playerCount !== null ? playerCount.toLocaleString() : (playerCountLoading ? '…' : '—')}
                </span>
              </div>
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden sm:flex items-center justify-between">
            <div className="flex items-center">
              <div className="mr-4">
                <img
                  src="/assets/daw-logo.webp"
                  alt="Dawn of War: Definitive Edition"
                  className="h-16 w-auto object-contain"
                />
              </div>
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
        <div className="border-b border-neutral-700/60 mb-4 sm:mb-6">
          {/* Mobile Navigation */}
          <div className="flex flex-col sm:hidden space-y-2">
            <div className="flex">
              <button
                onClick={() => setActiveTab('leaderboards')}
                className={`flex-1 px-4 py-3 font-medium transition-all duration-300 text-center ${
                  activeTab === 'leaderboards'
                    ? 'text-white bg-neutral-800/50 shadow-lg border-b-2 border-neutral-400'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
                }`}
              >
                Leaderboards
              </button>
              <button
                onClick={() => setActiveTab('search')}
                className={`flex-1 px-4 py-3 font-medium transition-all duration-300 text-center ${
                  activeTab === 'search'
                    ? 'text-white bg-neutral-800/50 shadow-lg border-b-2 border-neutral-400'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
                }`}
              >
                Search
              </button>
              <button
                onClick={() => setActiveTab('favorites')}
                className={`flex-1 px-4 py-3 font-medium transition-all duration-300 text-center ${
                  activeTab === 'favorites'
                    ? 'text-white bg-neutral-800/50 shadow-lg border-b-2 border-neutral-400'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
                }`}
              >
                Favourites
              </button>
              <button
                onClick={() => setActiveTab('support')}
                className={`flex-1 px-4 py-3 font-medium transition-all duration-300 text-center ${
                  activeTab === 'support'
                    ? 'text-white bg-neutral-800/50 shadow-lg border-b-2 border-neutral-400'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
                }`}
              >
                Support
              </button>
            </div>
            <div className="flex">
              <a
                href="https://github.com/EnzeD/dow-leaderboards"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2 font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/30 transition-all duration-300 flex items-center justify-center gap-2 text-sm"
              >
                GitHub
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
              <a
                href="https://www.reddit.com/r/dawnofwar/comments/1nguikt/i_built_a_dawn_of_war_definitive_edition/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-4 py-2 font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/30 transition-all duration-300 flex items-center justify-center gap-2 text-sm"
              >
                Feedback
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>

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
              onClick={() => setActiveTab('support')}
              className={`px-6 py-3 font-medium transition-all duration-300 ${
                activeTab === 'support'
                  ? 'text-white border-b-3 border-neutral-400 bg-neutral-800/50 shadow-lg'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
              }`}
            >
              Support
            </button>
            <a
              href="https://github.com/EnzeD/dow-leaderboards"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/30 transition-all duration-300 flex items-center gap-2"
            >
              Contribute on GitHub
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <a
              href="https://www.reddit.com/r/dawnofwar/comments/1nguikt/i_built_a_dawn_of_war_definitive_edition/"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-3 font-medium text-neutral-300 hover:text-white hover:bg-neutral-800/30 transition-all duration-300 flex items-center gap-2"
            >
              Provide Feedback
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
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
                  onChange={(e) => setSelectedFaction(e.target.value)}
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
                className="w-full px-4 py-3 bg-neutral-900 border border-neutral-600/50 rounded-md text-white placeholder-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/20 transition-all text-base"
              />
            </div>
            {search.trim() && filteredRows.length === 0 && lbExpanded && (
              <div className="text-xs sm:text-sm text-neutral-300 bg-neutral-900/40 border border-neutral-700/40 rounded-md p-3">
                <span className="font-semibold text-white">No results on this leaderboard.</span>{' '}
                <span>
                  Try a profile search — use the exact multiplayer profile name (case-sensitive).
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('search');
                    setSearchQuery(search.trim());
                    handlePlayerSearch(search.trim(), { pushHistory: true });
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
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                Showing: {isCombinedMode ? "Combined 1v1 Rankings - All factions" : (selectedFaction === "All factions" ? `All factions • ${selectedMatchType}` : `${selectedLeaderboard?.faction} • ${selectedLeaderboard?.matchType}`)}
                {ladderData && (
                  <>
                    {" • "}Last updated: {new Date(ladderData.lastUpdated).toLocaleString()}
                    {ladderData.stale && (
                      <span className="ml-2 px-2 py-1 bg-yellow-600 text-yellow-100 rounded">Stale Data</span>
                    )}
                  </>
                )}
              </div>
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
        )}

        {/* Table - Desktop */}
        {loading ? (
          <div className="text-center py-16 text-white font-medium">
            Loading...
          </div>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block bg-neutral-900 border border-neutral-600/40 rounded-lg shadow-2xl overflow-x-auto">
              <table className="w-full">
                <thead className="bg-neutral-800 border-b-2 border-neutral-600/50" style={{background: 'linear-gradient(135deg, #262626, #171717)'}}>
                  <tr>
                    {[
                      { key: "rank", label: "Rank" },
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
                        className="px-4 py-3 text-left cursor-pointer hover:bg-neutral-700/30 text-white font-bold border-r border-neutral-600/30 last:border-r-0 transition-all duration-300 whitespace-nowrap"
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
                  {sortedRows.map((row, i) => (
                    <tr key={row.profileId} className={`${i % 2 === 0 ? "bg-neutral-900/80" : "bg-neutral-800/80"} hover:bg-neutral-700/30 border-b border-neutral-600/20 transition-all duration-300 backdrop-blur-sm`}>
                      <td className={`px-4 py-3 ${getRankColor(row.rank)} font-bold text-sm border-r border-neutral-600/20`}>
                        <div className="flex items-center gap-2">
                          <span className="text-lg drop-shadow-lg">{getTierIndicator(row.rank)}</span>
                          <span className="font-bold">
                            {row.rank}
                          </span>
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${row.playerName === "Unknown" ? "text-neutral-500" : "text-white font-medium"} border-r border-neutral-600/20 min-w-0`}>
                        <div className="flex items-center gap-2">
                          {row.country && <FlagIcon countryCode={row.country} />}
                          <button
                            type="button"
                            onClick={() => runSearchByName(row.playerName)}
                            className="truncate text-left hover:underline"
                            title={`Search for ${row.playerName}`}
                          >
                            {row.playerName}
                          </button>
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
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View - Ultra Compact Single Line */}
            <div className="md:hidden space-y-1">
              {sortedRows.map((row, i) => (
                <div key={row.profileId} className={`${i % 2 === 0 ? "bg-neutral-900/70" : "bg-neutral-800/70"} border border-neutral-600/30 rounded p-2 backdrop-blur-sm`}>
                  {/* Everything in one line */}
                  <div className="flex items-center gap-2 text-xs">
                    {/* Rank */}
                    <div className={`flex items-center gap-1 ${getRankColor(row.rank)} shrink-0`}>
                      <span className="text-xs">{getTierIndicator(row.rank)}</span>
                      <span className="font-bold text-xs">#{row.rank}</span>
                    </div>

                    {/* Player Name with Flag */}
                    <div className={`flex items-center gap-1 min-w-0 flex-1 ${row.playerName === "Unknown" ? "text-neutral-500" : "text-white"}`}>
                      {row.country && <FlagIcon countryCode={row.country} compact />}
                      <button
                        type="button"
                        onClick={() => runSearchByName(row.playerName)}
                        className="text-xs truncate font-medium text-left hover:underline"
                        title={`Search for ${row.playerName}`}
                      >
                        {row.playerName}
                      </button>
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
              ))}
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
                Exact search by in-game profile name (alias). It&apos;s case-sensitive.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <label htmlFor="player-search-input" className="sr-only">Player name or Steam alias</label>
                <input
                  id="player-search-input"
                  name="playerSearch"
                  type="text"
                  placeholder="Enter player name or Steam alias..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full flex-1 min-w-0 px-4 py-3 bg-neutral-900 border border-neutral-600/40 rounded-md text-white placeholder-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/30 transition-all duration-300 shadow-inner text-base"
                  onKeyPress={(e) => e.key === 'Enter' && handlePlayerSearch()}
                />
                <button
                  onClick={() => handlePlayerSearch()}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-neutral-600 to-neutral-700 hover:from-neutral-700 hover:to-neutral-800 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-bold rounded-md shadow-lg border border-neutral-500 transition-all duration-300 transform hover:scale-105"
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
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
                            {typeof result.personalStats?.profile?.level === 'number' && (
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-neutral-400">Level</span>
                                <span className="text-white">{result.personalStats.profile.level}</span>
                              </div>
                            )}
                            {typeof result.personalStats?.profile?.xp === 'number' && (
                              <div className="flex items-center gap-1 text-xs">
                                <span className="text-neutral-400">XP</span>
                                <span className="text-white">{result.personalStats.profile.xp.toLocaleString?.() || result.personalStats.profile.xp}</span>
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end items-start gap-2 sm:gap-3 sm:text-right">
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
                              }`}
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
                            {(result.lastUpdated || searchUpdatedAt) && (
                              <span className="text-xs text-neutral-400 text-left sm:text-right">
                                Last updated: {formatTimestamp(result.lastUpdated || searchUpdatedAt) ?? 'Unknown'}
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const url = buildUrl({ view: 'search', searchQuery });
                                  await navigator.clipboard.writeText(url);
                                  setSearchCardCopied(index);
                                  setTimeout(() => setSearchCardCopied(null), 1200);
                                } catch {}
                              }}
                              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-neutral-800/70 hover:bg-neutral-700/70 text-white rounded-md border border-neutral-600/40 transition-colors"
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

                        {/* Recent Match History */}
                        {result.recentMatches && result.recentMatches.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-neutral-600/40">
                            <h5 className="text-sm text-neutral-300 mb-2">Recent Match History</h5>
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
                                const matchType = m.matchTypeId === 1 ? '1v1' : m.matchTypeId === 2 ? '2v2' : m.matchTypeId === 3 ? '3v3' : m.matchTypeId === 4 ? '4v4' : 'Match';
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

                                const teamEntries: RosterEntry[] = [
                                  {
                                    key: `self-${result.profileId}`,
                                    label: displaySelfAlias,
                                    faction: myFaction,
                                    onClick: displaySelfAlias ? () => runSearchByName(displaySelfAlias) : undefined,
                                  },
                                  ...allies.slice(0, 2).map((p: any, index: number) => {
                                    const label = p.alias || String(p.profileId);
                                    const faction = raceIdToFaction(p.raceId);
                                    return {
                                      key: `ally-${p.profileId}-${index}`,
                                      label,
                                      faction,
                                      onClick: p.alias ? () => runSearchByName(p.alias) : undefined,
                                    } satisfies RosterEntry;
                                  }),
                                ];

                                const opponentEntries: RosterEntry[] = opps.slice(0, 3).map((p: any, index: number) => {
                                  const label = p.alias || String(p.profileId);
                                  const faction = raceIdToFaction(p.raceId);
                                  return {
                                    key: `opp-${p.profileId}-${index}`,
                                    label,
                                    faction,
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
                                          title={entry.label}
                                          disabled={!entry.onClick}
                                        >
                                          {entry.label}
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
                  const level = typeof profile?.level === 'number' ? profile.level : undefined;
                  const xp = typeof profile?.xp === 'number' ? profile.xp : undefined;
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
                              onClick={() => runSearchByName(entry.alias)}
                              className="inline-flex items-center justify-center gap-2 px-3 py-1.5 bg-neutral-800/70 hover:bg-neutral-700/70 text-white rounded-md border border-neutral-600/40 transition-colors text-xs font-semibold"
                            >
                              View in Search
                            </button>
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
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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
              <p className="text-neutral-400">
                Consider supporting to cover costs for this free community website.{' '}
                <button
                  type="button"
                  onClick={handleSupportLink}
                  className="font-semibold text-blue-300 transition hover:text-blue-200"
                >
                  Go to Support
                </button>
              </p>
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
                <a
                  href="https://www.reddit.com/r/dawnofwar/comments/1nguikt/i_built_a_dawn_of_war_definitive_edition/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-fit transition hover:text-white"
                >
                  Community Feedback Thread
                </a>
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
    </div>
  );
}
