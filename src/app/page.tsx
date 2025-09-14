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
const FlagIcon = ({ countryCode }: { countryCode: string }) => {
  const countryInfo = getCountryInfo(countryCode);
  if (!countryInfo) return null;

  // Special handling for complex flags
  const renderFlag = () => {
    const code = countryCode.toLowerCase();

    if (code === 'ua') {
      // Ukraine - horizontal bands
      return (
        <div className="w-5 h-3 rounded-sm overflow-hidden border border-gray-400 shadow-sm">
          <div className="w-full h-1/2" style={{ backgroundColor: '#005BBB' }} />
          <div className="w-full h-1/2" style={{ backgroundColor: '#FFD500' }} />
        </div>
      );
    }

    if (code === 'ru') {
      // Russia - horizontal bands
      return (
        <div className="w-5 h-3 rounded-sm overflow-hidden border border-gray-400 shadow-sm">
          <div className="w-full h-1/3" style={{ backgroundColor: '#FFFFFF' }} />
          <div className="w-full h-1/3" style={{ backgroundColor: '#0039A6' }} />
          <div className="w-full h-1/3" style={{ backgroundColor: '#D52B1E' }} />
        </div>
      );
    }

    if (code === 'by') {
      // Belarus - special pattern
      return (
        <div className="w-5 h-3 rounded-sm overflow-hidden border border-gray-400 shadow-sm flex">
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
        <div className="w-5 h-3 rounded-sm overflow-hidden border border-gray-400 shadow-sm">
          <div className="w-full h-1/3" style={{ backgroundColor: '#000000' }} />
          <div className="w-full h-1/3" style={{ backgroundColor: '#DD0000' }} />
          <div className="w-full h-1/3" style={{ backgroundColor: '#FFCE00' }} />
        </div>
      );
    }

    if (code === 'fr') {
      // France - vertical bands
      return (
        <div className="w-5 h-3 rounded-sm overflow-hidden border border-gray-400 shadow-sm flex">
          <div className="flex-1 h-full" style={{ backgroundColor: '#0055A4' }} />
          <div className="flex-1 h-full" style={{ backgroundColor: '#FFFFFF' }} />
          <div className="flex-1 h-full" style={{ backgroundColor: '#EF4135' }} />
        </div>
      );
    }

    // Default: simple horizontal stripes
    return (
      <div className="w-5 h-3 rounded-sm overflow-hidden border border-gray-400 shadow-sm flex">
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
      className="inline-flex items-center gap-1.5 text-xs bg-gray-700/80 px-2 py-1 rounded-md border border-gray-600/50 backdrop-blur-sm"
      title={`${countryInfo.name} (${countryInfo.code})`}
    >
      {renderFlag()}
      <span className="font-mono text-gray-200 font-medium text-xs">
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
  const [selectedFaction, setSelectedFaction] = useState<string>("1v1 - All Factions");
  const [selectedMatchType, setSelectedMatchType] = useState<string>("All Types");

  // Check if we're in combined mode
  const isCombinedMode = selectedFaction === "1v1 - All Factions";

  // Get unique factions and match types
  const factions = ["All Factions", "1v1 - All Factions", ...Array.from(new Set(leaderboards.map(lb => lb.faction).filter(Boolean)))];
  const matchTypes = ["All Types", ...Array.from(new Set(leaderboards.map(lb => lb.matchType).filter(Boolean)))];

  // Filter leaderboards based on selection (not used in combined mode)
  const filteredLeaderboards = leaderboards.filter(lb =>
    (selectedFaction === "All Factions" || selectedFaction === "1v1 - All Factions" || lb.faction === selectedFaction) &&
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
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center mb-8">
          <div className="flex items-center">
            <div className="mr-4">
              <img
                src="/assets/daw-logo.webp"
                alt="Dawn of War: Definitive Edition"
                className="h-16 w-auto object-contain"
              />
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-yellow-400">
                Dawn of War: Definitive Edition Leaderboards
              </h1>
              <span className="px-2 py-1 bg-yellow-600 text-yellow-100 text-xs font-semibold rounded-md">
                BETA
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-700 mb-6">
          <button
            onClick={() => setActiveTab('leaderboards')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'leaderboards'
                ? 'text-yellow-400 border-b-2 border-yellow-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Leaderboards
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'search'
                ? 'text-yellow-400 border-b-2 border-yellow-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Search
          </button>
          <a
            href="https://github.com/EnzeD/dow-leaderboards"
            target="_blank"
            rel="noopener noreferrer"
            className="px-6 py-3 font-medium text-gray-400 hover:text-white transition-colors flex items-center gap-2"
          >
            Contribute on GitHub
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>

        {/* Leaderboards Tab Content */}
        {activeTab === 'leaderboards' && (
          <>
            {/* Filter Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="flex flex-col">
            <label className="text-sm text-gray-400 mb-2">Region</label>
            <select className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white">
              <option>Global</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-400 mb-2">Platform</label>
            <select className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white">
              <option>PC</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-400 mb-2">Faction</label>
            <select
              value={selectedFaction}
              onChange={(e) => setSelectedFaction(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              disabled={loading}
            >
              {factions.map(faction => (
                <option key={faction} value={faction}>{faction}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-sm text-gray-400 mb-2">Type</label>
            <select
              value={selectedMatchType}
              onChange={(e) => setSelectedMatchType(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              disabled={loading}
            >
              {matchTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Specific Leaderboard Selection & Search */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          {!isCombinedMode && (
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2 text-white"
              disabled={loading}
            >
              {filteredLeaderboards.map(lb => (
                <option key={lb.id} value={lb.id}>{lb.name}</option>
              ))}
            </select>
          )}

          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`px-3 py-2 bg-gray-800 border border-gray-700 rounded text-white placeholder-gray-400 ${isCombinedMode ? 'flex-1' : 'flex-1'}`}
          />
        </div>

        {/* Current Selection Info */}
        {(selectedLeaderboard || isCombinedMode) && (
          <div className="mb-4 text-sm text-gray-400">
            Showing: {isCombinedMode ? "Combined 1v1 Rankings - All Factions" : `${selectedLeaderboard?.faction} • ${selectedLeaderboard?.matchType}`}
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

        {/* Table */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : (
          <div className="overflow-x-auto bg-gray-800 rounded-lg shadow-lg">
            <table className="w-full">
              <thead className="bg-gray-700">
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
                      className="px-4 py-4 text-left cursor-pointer hover:bg-gray-600 text-gray-200 font-medium"
                      onClick={() => handleSort(key as keyof LadderRow)}
                    >
                      {label}
                      {sortField === key && (
                        <span className="ml-1 text-yellow-400">{sortDesc ? "↓" : "↑"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => (
                  <tr key={row.profileId} className={`${i % 2 === 0 ? "bg-gray-800" : "bg-gray-750"} hover:bg-gray-700 transition-colors`}>
                    <td className="px-4 py-4 text-yellow-400 font-semibold">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getTierIndicator(row.rank)}</span>
                        {row.rank}
                      </div>
                    </td>
                    <td className={`px-4 py-4 ${row.playerName === "Unknown" ? "text-gray-500" : "text-blue-400"}`}>
                      <div className="flex items-center gap-2">
                        {row.country && <FlagIcon countryCode={row.country} />}
                        {row.playerName}
                      </div>
                    </td>
                    {isCombinedMode && (
                      <td className="px-4 py-4 text-orange-300 font-medium">{row.faction || 'Unknown'}</td>
                    )}
                    <td className="px-4 py-4 text-white font-semibold">{row.rating}</td>
                    <td className={`px-4 py-4 font-semibold ${row.streak > 0 ? "text-green-400" : row.streak < 0 ? "text-red-400" : "text-gray-400"}`}>
                      {row.streak > 0 ? `+${row.streak}` : row.streak}
                    </td>
                    <td className="px-4 py-4 text-green-400">{row.wins}</td>
                    <td className="px-4 py-4 text-red-400">{row.losses}</td>
                    <td className="px-4 py-4 text-white">{row.winrate}%</td>
                    <td className="px-4 py-4 text-gray-400 text-sm">
                      {formatLastMatch(row.lastMatchDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

            {/* Footer */}
            <div className="mt-8 text-center text-sm text-gray-500">
              Data from Relic Community API • Updates in real-time
            </div>
          </>
        )}

        {/* Search Tab Content */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-bold text-yellow-400 mb-4">Player Search</h2>
              <p className="text-gray-400 mb-6">
                Search for a player by their Steam name or alias to find their profile ID and statistics across all leaderboards.
              </p>

              <div className="flex gap-4 mb-6">
                <input
                  type="text"
                  placeholder="Enter player name or Steam alias..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-4 py-3 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400"
                  onKeyPress={(e) => e.key === 'Enter' && handlePlayerSearch()}
                />
                <button
                  onClick={handlePlayerSearch}
                  disabled={searchLoading || !searchQuery.trim()}
                  className="px-6 py-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium rounded transition-colors"
                >
                  {searchLoading ? 'Searching...' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold text-white">Search Results</h3>
                  <div className="grid gap-4">
                    {searchResults.map((result, index) => (
                      <div key={index} className="bg-gray-700 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <h4 className="text-white font-medium">{result.playerName}</h4>
                            <p className="text-gray-400 text-sm">Profile ID: {result.profileId}</p>
                            {result.steamProfile && (
                              <p className="text-gray-400 text-sm">Steam: {result.steamProfile.personaname}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleViewPlayerStats(result.playerName)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                          >
                            View Stats
                          </button>
                        </div>

                        {/* Leaderboard appearances */}
                        {result.leaderboardAppearances && result.leaderboardAppearances.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-gray-600">
                            <h5 className="text-sm text-gray-300 mb-2">Leaderboard Appearances:</h5>
                            <div className="grid gap-2">
                              {result.leaderboardAppearances.slice(0, 3).map((appearance: any, appIndex: number) => (
                                <div key={appIndex} className="text-xs bg-gray-800 p-2 rounded">
                                  <div className="flex justify-between items-center">
                                    <span className="text-orange-300">
                                      {appearance.faction} {appearance.matchType}
                                    </span>
                                    <div className="flex gap-3">
                                      <span className="text-yellow-400">#{appearance.rank}</span>
                                      <span className="text-white">{appearance.rating} ELO</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              {result.leaderboardAppearances.length > 3 && (
                                <p className="text-xs text-gray-400">
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