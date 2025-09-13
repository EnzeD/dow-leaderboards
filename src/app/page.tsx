"use client";

import { useState, useEffect } from "react";
import { LadderRow, Leaderboard } from "@/lib/relic";

type LadderData = {
  leaderboardId: number;
  lastUpdated: string;
  stale: boolean;
  rows: LadderRow[];
};

// Country code to name mapping
const getCountryName = (countryCode?: string): string => {
  if (!countryCode) return "";
  const countries: Record<string, string> = {
    'by': 'BY',
    'ru': 'RU',
    'ua': 'UA',
    'kz': 'KZ',
    'us': 'US',
    'ca': 'CA',
    'de': 'DE',
    'fr': 'FR',
    'uk': 'UK',
    'pl': 'PL',
    'se': 'SE',
    'no': 'NO',
    'dk': 'DK',
    'fi': 'FI',
    'nl': 'NL',
    'be': 'BE',
    'ch': 'CH',
    'at': 'AT',
    'it': 'IT',
    'es': 'ES',
    'pt': 'PT',
    'br': 'BR',
    'ar': 'AR',
    'mx': 'MX',
    'jp': 'JP',
    'kr': 'KR',
    'cn': 'CN',
    'in': 'IN',
    'au': 'AU',
    'nz': 'NZ'
  };
  return countries[countryCode.toLowerCase()] || countryCode.toUpperCase();
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

export default function Home() {
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [selectedId, setSelectedId] = useState<number>(1);
  const [ladderData, setLadderData] = useState<LadderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof LadderRow>("rank");
  const [sortDesc, setSortDesc] = useState(false);

  // Filter states
  const [selectedFaction, setSelectedFaction] = useState<string>("All Factions");
  const [selectedMatchType, setSelectedMatchType] = useState<string>("All Types");

  // Get unique factions and match types
  const factions = ["All Factions", ...Array.from(new Set(leaderboards.map(lb => lb.faction).filter(Boolean)))];
  const matchTypes = ["All Types", ...Array.from(new Set(leaderboards.map(lb => lb.matchType).filter(Boolean)))];

  // Filter leaderboards based on selection
  const filteredLeaderboards = leaderboards.filter(lb =>
    (selectedFaction === "All Factions" || lb.faction === selectedFaction) &&
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
    if (!selectedId) return;
    setLoading(true);
    fetch(`/api/ladder?leaderboard_id=${selectedId}`)
      .then(r => r.json())
      .then(data => {
        setLadderData(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedId]);

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

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto p-6 max-w-7xl">
        {/* Header */}
        <div className="flex items-center mb-8">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center mr-4">
              <span className="text-black font-bold text-xl">⚡</span>
            </div>
            <h1 className="text-3xl font-bold text-yellow-400">
              Leaderboards for Dawn of War: Definitive Edition
            </h1>
          </div>
        </div>

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

          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded flex-1 text-white placeholder-gray-400"
          />
        </div>

        {/* Current Selection Info */}
        {selectedLeaderboard && (
          <div className="mb-4 text-sm text-gray-400">
            Showing: {selectedLeaderboard.faction} • {selectedLeaderboard.matchType}
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
                        {row.country && (
                          <span className="text-xs bg-gray-600 px-2 py-1 rounded font-mono text-gray-300" title={`Country: ${getCountryName(row.country)}`}>
                            {getCountryName(row.country)}
                          </span>
                        )}
                        {row.playerName}
                      </div>
                    </td>
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
      </div>
    </div>
  );
}