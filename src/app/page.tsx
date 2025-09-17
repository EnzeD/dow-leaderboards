"use client";

import { useState, useEffect } from "react";
import SupportButton from "@/app/_components/SupportButton";
import { LadderRow, Leaderboard } from "@/lib/relic";
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

const FactionLogo = ({ faction, size = 16, className = '' }: { faction?: string; size?: number; className?: string }) => {
  const icon = faction ? FACTION_ICON_MAP[faction] : undefined;
  if (!icon) return null;
  const url = typeof icon === 'string' ? icon : (icon as any).src || '';
  const dim = `${size}px`;
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
type TabType = 'leaderboards' | 'search' | 'support';

export default function Home() {
  type AppState = {
    view: 'leaderboards' | 'search' | 'support';
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
  const [searchLoading, setSearchLoading] = useState(false);
  const [combinedLimit, setCombinedLimit] = useState<number>(200);
  const [lbExpanded, setLbExpanded] = useState(false);

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
      if (combinedLimit !== 200) setCombinedLimit(200);
    } else if (selectedId) {
      if (lbExpanded) {
        try {
          fetch(`/api/cache/leaderboard/${selectedId}`)
            .then(r => r.json())
            .then(data => setLadderData(data))
            .catch(() => {});
        } finally {
          setLbExpanded(false);
        }
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

    try {
      const response = await fetch(`/api/cache/player/by-alias/${encodeURIComponent(q)}`);
      if (response.ok) {
        const data = await response.json();
        // Expect { results: [ ... ] }
        setSearchResults(Array.isArray(data?.results) ? data.results : []);
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
            </div>
          </div>

          {/* Desktop Header */}
          <div className="hidden sm:flex items-center">
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
              <label className="text-sm text-neutral-300 mb-2 font-medium">Type</label>
              <select
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
                <label className="text-sm text-neutral-300 mb-2 font-medium">Faction</label>
                <select
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
              <label className="text-sm text-neutral-300 mb-2 font-medium">Country</label>
              <select
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
              <label className="text-xs text-neutral-400 mb-1">Search Players</label>
              <input
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
                <input
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
                  <h3 className="text-lg font-semibold text-white">Search Results</h3>
                  <div className="grid gap-4 grid-cols-1">
                    {searchResults.map((result, index) => (
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
                            className="self-start sm:self-auto inline-flex items-center gap-2 px-3 py-1.5 bg-neutral-800/70 hover:bg-neutral-700/70 text-white rounded-md border border-neutral-600/40 transition-colors"
                            title="Copy link to this player search"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12v7a1 1 0 001 1h12a1 1 0 001-1v-7M16 6l-4-4m0 0L8 6m4-4v12" />
                            </svg>
                            <span className={`text-xs font-semibold ${searchCardCopied === index ? 'text-green-400' : ''}`}>{searchCardCopied === index ? 'Link copied' : 'Copy link'}</span>
                          </button>
                        </div>

                        {result.personalStats?.leaderboardStats && result.personalStats.leaderboardStats.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-neutral-600/40">
                            <h5 className="text-sm text-neutral-300 mb-2">Stats by Leaderboard:</h5>
                            <div className="grid gap-2">
                              {result.personalStats.leaderboardStats
                                .slice()
                                .sort((a: any, b: any) => (b.lastmatchdate || 0) - (a.lastmatchdate || 0) || b.rating - a.rating)
                                .slice(0, 6)
                                .map((s: any, appIndex: number) => {
                                  const lb = leaderboards.find(l => l.id === s.leaderboardId);
                                  const name = lb?.name || `Leaderboard ${s.leaderboardId}`;
                                  const faction = lb?.faction || 'Unknown';
                                  const type = lb?.matchType || '';
                                  return (
                                    <div key={appIndex} className="text-xs bg-neutral-900 border border-neutral-600/25 p-2 rounded shadow-md">
                                      <div className="flex justify-between items-center p-1 rounded hover:bg-neutral-800/30 transition-all duration-200">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className={`${getFactionColor(faction)} inline-flex items-center`}>
                                            <FactionLogo faction={faction} size={14} />
                                          </span>
                                          <span className="text-orange-300 truncate" title={name}>
                                            {faction} {type}
                                          </span>
                                          <span className="text-neutral-400 hidden sm:inline">•</span>
                                          <span className="text-neutral-300 truncate hidden sm:inline" title={name}>{name}</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <span className={getRankColor(s.rank)}>{s.rank > 0 ? `#${s.rank}` : '-'}</span>
                                          <span className="text-white">{s.rating} ELO</span>
                                          <span className="text-neutral-300">{s.wins}<span className="text-neutral-500">-</span>{s.losses}</span>
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
                        )}

                        {/* Recent Match History */}
                        {result.recentMatches && result.recentMatches.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-neutral-600/40">
                            <h5 className="text-sm text-neutral-300 mb-2">Recent Match History</h5>
                            <div className="grid gap-2">
                              {result.recentMatches
                                .slice()
                                .sort((a: any, b: any) => (
                                  (b.endTime ?? b.startTime ?? 0) - (a.endTime ?? a.startTime ?? 0)
                                ))
                                .slice(0, 8)
                                .map((m: any, mi: number) => {
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
                                return (
                                  <div key={mi} className="text-xs bg-neutral-900 border border-neutral-600/25 p-2 rounded shadow-md">
                                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                                        <span className={`${outcomeColor} font-semibold`}>{m.outcome || 'Unknown'}</span>
                                        <span className="text-neutral-500">•</span>
                                        <span className="text-white truncate" title={m.mapName}>{m.mapName || 'Unknown Map'}</span>
                                        <span className="text-neutral-500">•</span>
                                        <span className="text-orange-300">{matchType}</span>
                                        <>
                                          <span className="text-neutral-500">•</span>
                                          <span className={`${myFaction === 'Unknown' ? 'text-neutral-400' : getFactionColor(myFaction)}`}>{myFaction}</span>
                                        </>
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
                                      <div className="flex items-center gap-2 mt-1 sm:mt-0">
                                        {typeof m.oldRating === 'number' && typeof m.newRating === 'number' && (
                                          <span className="text-neutral-300">{m.oldRating}→{m.newRating}</span>
                                        )}
                                        {typeof m.ratingDiff === 'number' && (
                                          <span className={`font-semibold ${diffColor}`}>{m.ratingDiff > 0 ? `+${m.ratingDiff}` : m.ratingDiff}</span>
                                        )}
                                      </div>
                                    </div>
                                    {(allies.length > 0 || opps.length > 0) && (
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-2 gap-2">
                                        <div className="flex-1 min-w-0">
                                          <span className="text-neutral-400 mr-1">Team:</span>
                                          <span className="text-neutral-200 sm:truncate break-words">
                                            {allies.slice(0,3).map((p: any, i: number) => {
                                              const f = raceIdToFaction(p.raceId);
                                              return (
                                                <button
                                                  key={p.profileId + i}
                                                  type="button"
                                                  onClick={() => p.alias && runSearchByName(p.alias)}
                                                  className={`hover:underline ${p.alias ? 'text-blue-300' : 'text-neutral-400 cursor-default'}`}
                                                  title={p.alias || p.profileId}
                                                >
                                                  {p.alias || p.profileId}
                                                  {f !== 'Unknown' && (
                                                    <span className={`ml-1 ${getFactionColor(f)} inline-flex items-center gap-1`}>
                                                      <FactionLogo faction={f} size={12} />
                                                      ({f})
                                                    </span>
                                                  )}
                                                  {i < Math.min(allies.length, 3) - 1 ? ', ' : ''}
                                                </button>
                                              );
                                            })}
                                            {allies.length > 3 && ` +${allies.length - 3}`}
                                          </span>
                                        </div>
                                        <div className="flex-1 min-w-0 sm:text-right">
                                          <span className="text-neutral-400 mr-1">Opponents:</span>
                                          <span className="text-neutral-200 sm:truncate break-words">
                                            {opps.slice(0,3).map((p: any, i: number) => {
                                              const f = raceIdToFaction(p.raceId);
                                              return (
                                                <button
                                                  key={p.profileId + i}
                                                  type="button"
                                                  onClick={() => p.alias && runSearchByName(p.alias)}
                                                  className={`hover:underline ${p.alias ? 'text-blue-300' : 'text-neutral-400 cursor-default'}`}
                                                  title={p.alias || p.profileId}
                                                >
                                                  {p.alias || p.profileId}
                                                  {f !== 'Unknown' && (
                                                    <span className={`ml-1 ${getFactionColor(f)} inline-flex items-center gap-1`}>
                                                      <FactionLogo faction={f} size={12} />
                                                      ({f})
                                                    </span>
                                                  )}
                                                  {i < Math.min(opps.length, 3) - 1 ? ', ' : ''}
                                                </button>
                                              );
                                            })}
                                            {opps.length > 3 && ` +${opps.length - 3}`}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!searchLoading && searchQuery.trim() && searchResults.length === 0 && (
                <div className="mt-4 text-sm text-neutral-300 bg-neutral-900/40 border border-neutral-700/40 rounded-md p-4">
                  <span className="font-semibold text-white">No Results.</span>{' '}
                  <span>
                    Hint: enter the exact name you are using in your multiplayer profile. It&apos;s case-sensitive.
                  </span>
                </div>
              )}
            </div>
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
