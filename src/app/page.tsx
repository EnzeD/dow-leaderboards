"use client";

import { useState, useEffect } from "react";
import { LadderRow, Leaderboard } from "@/lib/relic";

type LadderData = {
  leaderboardId: number;
  lastUpdated: string;
  stale: boolean;
  rows: LadderRow[];
};

// Country code to name mapping and flag component
const getCountryInfo = (countryCode?: string) => {
  if (!countryCode) return null;

  const countries: Record<string, { name: string; colors: string[] }> = {
    'by': { name: 'Belarus', colors: ['#00AF66', '#FFFFFF', '#CE1021'] },
    'ru': { name: 'Russia', colors: ['#FFFFFF', '#0039A6', '#D52B1E'] },
    'ua': { name: 'Ukraine', colors: ['#005BBB', '#FFD500'] },
    'kz': { name: 'Kazakhstan', colors: ['#00AFCA', '#FEDF00'] },
    'us': { name: 'United States', colors: ['#B22234', '#FFFFFF', '#3C3B6E'] },
    'ca': { name: 'Canada', colors: ['#FF0000', '#FFFFFF'] },
    'de': { name: 'Germany', colors: ['#000000', '#DD0000', '#FFCE00'] },
    'fr': { name: 'France', colors: ['#0055A4', '#FFFFFF', '#EF4135'] },
    'gb': { name: 'United Kingdom', colors: ['#012169', '#FFFFFF', '#C8102E'] },
    'uk': { name: 'United Kingdom', colors: ['#012169', '#FFFFFF', '#C8102E'] },
    'pl': { name: 'Poland', colors: ['#FFFFFF', '#DC143C'] },
    'se': { name: 'Sweden', colors: ['#006AA7', '#FECC00'] },
    'no': { name: 'Norway', colors: ['#EF2B2D', '#FFFFFF', '#002868'] },
    'dk': { name: 'Denmark', colors: ['#C60C30', '#FFFFFF'] },
    'fi': { name: 'Finland', colors: ['#FFFFFF', '#003580'] },
    'nl': { name: 'Netherlands', colors: ['#AE1C28', '#FFFFFF', '#21468B'] },
    'be': { name: 'Belgium', colors: ['#000000', '#FDDA24', '#EF3340'] },
    'ch': { name: 'Switzerland', colors: ['#DC143C', '#FFFFFF'] },
    'at': { name: 'Austria', colors: ['#ED2939', '#FFFFFF'] },
    'it': { name: 'Italy', colors: ['#009246', '#FFFFFF', '#CE2B37'] },
    'es': { name: 'Spain', colors: ['#AA151B', '#F1BF00'] },
    'pt': { name: 'Portugal', colors: ['#006600', '#FF0000'] },
    'br': { name: 'Brazil', colors: ['#009739', '#FEDD00', '#012169'] },
    'ar': { name: 'Argentina', colors: ['#74ACDF', '#FFFFFF'] },
    'mx': { name: 'Mexico', colors: ['#006847', '#FFFFFF', '#CE1126'] },
    'jp': { name: 'Japan', colors: ['#FFFFFF', '#BC002D'] },
    'kr': { name: 'South Korea', colors: ['#FFFFFF', '#C60C30', '#003478'] },
    'cn': { name: 'China', colors: ['#DE2910', '#FFDE00'] },
    'in': { name: 'India', colors: ['#FF9933', '#FFFFFF', '#138808'] },
    'au': { name: 'Australia', colors: ['#012169', '#FFFFFF', '#E4002B'] },
    'nz': { name: 'New Zealand', colors: ['#012169', '#FFFFFF', '#CC142B'] }
  };

  const country = countries[countryCode.toLowerCase()];
  return country ? {
    name: country.name,
    code: countryCode.toUpperCase(),
    colors: country.colors
  } : {
    name: countryCode.toUpperCase(),
    code: countryCode.toUpperCase(),
    colors: ['#666666', '#CCCCCC']
  };
};

// CSS-based flag component with better design
const FlagIcon = ({ countryCode, compact = false }: { countryCode: string; compact?: boolean }) => {
  const countryInfo = getCountryInfo(countryCode);
  if (!countryInfo) return null;

  // Special handling for complex flags
  const renderFlag = () => {
    const code = countryCode.toLowerCase();
    const flagSize = compact ? "w-4 h-2.5" : "w-5 h-3";

    if (code === 'ua') {
      // Ukraine - horizontal bands
      return (
        <div className={`${flagSize} rounded-sm overflow-hidden border border-neutral-400 shadow-sm`}>
          <div className="w-full h-1/2" style={{ backgroundColor: '#005BBB' }} />
          <div className="w-full h-1/2" style={{ backgroundColor: '#FFD500' }} />
        </div>
      );
    }

    if (code === 'ru') {
      // Russia - horizontal bands
      return (
        <div className={`${flagSize} rounded-sm overflow-hidden border border-neutral-400 shadow-sm`}>
          <div className="w-full h-1/3" style={{ backgroundColor: '#FFFFFF' }} />
          <div className="w-full h-1/3" style={{ backgroundColor: '#0039A6' }} />
          <div className="w-full h-1/3" style={{ backgroundColor: '#D52B1E' }} />
        </div>
      );
    }

    if (code === 'by') {
      // Belarus - special pattern
      return (
        <div className={`${flagSize} rounded-sm overflow-hidden border border-neutral-400 shadow-sm flex`}>
          <div className="w-1/5" style={{ backgroundColor: '#CE1021' }} />
          <div className="flex-1">
            <div className="w-full h-1/3" style={{ backgroundColor: '#CE1021' }} />
            <div className="w-full h-1/3" style={{ backgroundColor: '#00AF66' }} />
            <div className="w-full h-1/3" style={{ backgroundColor: '#CE1021' }} />
          </div>
        </div>
      );
    }

    if (code === 'de') {
      // Germany - horizontal bands
      return (
        <div className={`${flagSize} rounded-sm overflow-hidden border border-neutral-400 shadow-sm`}>
          <div className="w-full h-1/3" style={{ backgroundColor: '#000000' }} />
          <div className="w-full h-1/3" style={{ backgroundColor: '#DD0000' }} />
          <div className="w-full h-1/3" style={{ backgroundColor: '#FFCE00' }} />
        </div>
      );
    }

    if (code === 'fr') {
      // France - vertical bands
      return (
        <div className={`${flagSize} rounded-sm overflow-hidden border border-neutral-400 shadow-sm flex`}>
          <div className="flex-1 h-full" style={{ backgroundColor: '#0055A4' }} />
          <div className="flex-1 h-full" style={{ backgroundColor: '#FFFFFF' }} />
          <div className="flex-1 h-full" style={{ backgroundColor: '#EF4135' }} />
        </div>
      );
    }

    // Default: simple horizontal stripes
    return (
      <div className={`${flagSize} rounded-sm overflow-hidden border border-neutral-400 shadow-sm flex`}>
        {countryInfo.colors.map((color, index) => (
          <div
            key={index}
            className="flex-1 h-full"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    );
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 text-xs bg-neutral-700/80 ${compact ? 'px-1.5 py-0.5' : 'px-2 py-1'} rounded-md border border-neutral-600/50 backdrop-blur-sm`}
      title={`${countryInfo.name} (${countryInfo.code})`}
    >
      {renderFlag()}
      <span className={`font-mono text-neutral-200 font-medium ${compact ? 'text-xs' : 'text-xs'}`}>
        {countryInfo.code}
      </span>
    </div>
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
    'Tau': 'text-cyan-400',
    'Sisters of Battle': 'text-pink-400'
  };
  return factionColors[faction] || 'text-orange-300';
};

// Get rank color based on position
const getRankColor = (rank: number): string => {
  if (rank <= 5) return 'text-yellow-400'; // Gold for top 5
  if (rank <= 10) return 'text-yellow-300'; // Light gold for top 10
  if (rank <= 25) return 'text-orange-400'; // Orange for top 25
  return 'text-red-400'; // Red for others
};

// Tab types
type TabType = 'leaderboards' | 'search' | 'contribute';

export default function Home() {
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

  // Filter states
  const [selectedFaction, setSelectedFaction] = useState<string>("All factions");
  const [selectedMatchType, setSelectedMatchType] = useState<string>("1v1");

  // Check if we're in combined mode (only for All factions + 1v1)
  const isCombinedMode = selectedFaction === "All factions" && selectedMatchType === "1v1";

  // Get unique factions and match types
  // Only show "All factions" for 1v1 match type
  const availableFactions = Array.from(new Set(leaderboards.map(lb => lb.faction).filter(Boolean)));
  const factions = selectedMatchType === "1v1" || selectedMatchType === "All Types"
    ? ["All factions", ...availableFactions]
    : availableFactions;
  const matchTypes = ["1v1", "All Types", ...Array.from(new Set(leaderboards.map(lb => lb.matchType).filter(Boolean).filter(type => type !== "1v1")))];

  // Filter leaderboards based on selection (not used in combined mode)
  const filteredLeaderboards = leaderboards.filter(lb =>
    (selectedFaction === "All factions" || lb.faction === selectedFaction) &&
    (selectedMatchType === "All Types" || lb.matchType === selectedMatchType)
  );

  // Load leaderboards on mount
  useEffect(() => {
    fetch("/api/leaderboards")
      .then(r => r.json())
      .then(data => {
        setLeaderboards(data.items || []);
        if (data.items?.length) setSelectedId(data.items[0].id);
      });
  }, []);

  // Auto-switch away from "All factions" for non-1v1 match types
  useEffect(() => {
    if (selectedFaction === "All factions" && selectedMatchType !== "1v1" && selectedMatchType !== "All Types") {
      // Switch to the first available faction for this match type
      const factionsForMatchType = leaderboards
        .filter(lb => lb.matchType === selectedMatchType)
        .map(lb => lb.faction)
        .filter(Boolean);
      if (factionsForMatchType.length > 0) {
        setSelectedFaction(factionsForMatchType[0]);
      }
    }
  }, [selectedMatchType, leaderboards, selectedFaction]);

  // Update selected ID when filters change
  useEffect(() => {
    if (filteredLeaderboards.length > 0) {
      setSelectedId(filteredLeaderboards[0].id);
    }
  }, [selectedFaction, selectedMatchType, leaderboards]);

  // Load ladder when selection changes
  useEffect(() => {
    if (isCombinedMode) {
      // Fetch combined 1v1 data
      setLoading(true);
      fetch('/api/combined')
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
      fetch(`/api/ladder?leaderboard_id=${selectedId}`)
        .then(r => r.json())
        .then(data => {
          setLadderData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [selectedId, isCombinedMode]);

  const handleSort = (field: keyof LadderRow) => {
    if (sortField === field) {
      setSortDesc(!sortDesc);
    } else {
      setSortField(field);
      setSortDesc(field === "playerName"); // desc for strings
    }
  };

  // Filter and sort rows
  const filteredRows = ladderData?.rows?.filter(row =>
    row.playerName.toLowerCase().includes(search.toLowerCase())
  ) || [];

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

  // Search functionality
  const handlePlayerSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchResults([]);

    try {
      // Call the search API endpoint
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery.trim() })
      });

      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleViewPlayerStats = async (profileId: string) => {
    // Switch to leaderboards tab and search for this player
    setActiveTab('leaderboards');
    setSearch(profileId); // This will filter the current leaderboard
  };

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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          </div>
        </div>

        {/* Specific Leaderboard Selection & Search */}
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-neutral-900/30 rounded-lg border border-neutral-700/30" style={{backdropFilter: 'blur(10px)'}}>
          <div className="flex flex-col gap-4">
            {!isCombinedMode && (
              <div className="flex flex-col">
                <label className="text-xs text-neutral-400 mb-1">Specific Leaderboard</label>
                <select
                  value={selectedId}
                  onChange={(e) => setSelectedId(Number(e.target.value))}
                  className="bg-neutral-900 border border-neutral-600/50 rounded-md px-3 py-3 text-white focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/20 transition-all text-base"
                  disabled={loading}
                >
                  {filteredLeaderboards.map(lb => (
                    <option key={lb.id} value={lb.id}>{lb.name}</option>
                  ))}
                </select>
              </div>
            )}

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
          </div>
        </div>

        {/* Current Selection Info */}
        {(selectedLeaderboard || isCombinedMode || selectedFaction === "All factions") && (
          <div className="mb-4 text-sm text-neutral-300 font-medium p-3 bg-neutral-900/40 rounded-md border border-neutral-700/30" style={{backdropFilter: 'blur(5px)'}}>
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
                          <span className="truncate">{row.playerName}</span>
                        </div>
                      </td>
                      {isCombinedMode && (
                        <td className={`px-4 py-3 font-semibold border-r border-neutral-600/20 ${getFactionColor(row.faction || '')}`}>
                          <span className="truncate">{row.faction || 'Unknown'}</span>
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
                      <span className="text-xs truncate font-medium">{row.playerName}</span>
                      {isCombinedMode && (
                        <span className={`text-xs font-semibold ml-1 ${getFactionColor(row.faction || '')}`}>
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

            {/* Footer */}
            <div className="mt-8 text-center text-sm text-neutral-400 font-medium p-4 bg-neutral-900/20 rounded-lg border border-neutral-700/20" style={{backdropFilter: 'blur(5px)'}}>
              Data from Relic Community API • Updates in real-time
            </div>
          </>
        )}

        {/* Search Tab Content */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="bg-neutral-900 border border-neutral-600/40 rounded-lg p-6 shadow-2xl">
              <h2 className="text-xl font-bold text-white mb-4">Player Search</h2>
              <p className="text-neutral-400 mb-6">
                Search for a player by their Steam name or alias to find their profile ID and statistics across all leaderboards.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <input
                  type="text"
                  placeholder="Enter player name or Steam alias..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-4 py-3 bg-neutral-900 border border-neutral-600/40 rounded-md text-white placeholder-neutral-400 focus:border-neutral-400 focus:ring-2 focus:ring-neutral-500/30 transition-all duration-300 shadow-inner text-base"
                  onKeyPress={(e) => e.key === 'Enter' && handlePlayerSearch()}
                />
                <button
                  onClick={handlePlayerSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-neutral-600 to-neutral-700 hover:from-neutral-700 hover:to-neutral-800 disabled:bg-neutral-600 disabled:cursor-not-allowed text-white font-bold rounded-md shadow-lg border border-neutral-500 transition-all duration-300 transform hover:scale-105"
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Search Results</h3>
                  <div className="grid gap-4">
                    {searchResults.map((result, index) => (
                      <div key={index} className="bg-neutral-800 border border-neutral-600/30 rounded-lg p-4 shadow-lg">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-white font-medium">{result.playerName}</h4>
                            <p className="text-neutral-400 text-sm">Profile ID: {result.profileId}</p>
                            {result.steamProfile && (
                              <p className="text-neutral-400 text-sm">Steam: {result.steamProfile.personaname}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleViewPlayerStats(result.playerName)}
                            className="px-4 py-2 bg-gradient-to-r from-neutral-600 to-neutral-700 hover:from-neutral-700 hover:to-neutral-800 text-white font-semibold rounded-md shadow-md border border-neutral-500 transition-all duration-300 transform hover:scale-105"
                          >
                            View Stats
                          </button>
                        </div>

                        {/* Leaderboard appearances */}
                        {result.leaderboardAppearances && result.leaderboardAppearances.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-neutral-600/40">
                            <h5 className="text-sm text-neutral-300 mb-2">Leaderboard Appearances:</h5>
                            <div className="grid gap-2">
                              {result.leaderboardAppearances.slice(0, 3).map((appearance: any, appIndex: number) => (
                                <div key={appIndex} className="text-xs bg-neutral-900 border border-neutral-600/25 p-2 rounded shadow-md">
                                  <div className="flex justify-between items-center p-1 rounded hover:bg-neutral-800/30 transition-all duration-200">
                                    <span className="text-orange-300">
                                      {appearance.faction} {appearance.matchType}
                                    </span>
                                    <div className="flex gap-3">
                                      <span className={getRankColor(appearance.rank)}>#{appearance.rank}</span>
                                      <span className="text-white">{appearance.rating} ELO</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {result.leaderboardAppearances.length > 3 && (
                                <p className="text-xs text-neutral-400">
                                  +{result.leaderboardAppearances.length - 3} more leaderboards
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}