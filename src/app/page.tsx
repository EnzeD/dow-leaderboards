"use client";

import { useState, useEffect } from "react";
import { LadderRow } from "@/lib/relic";

type Leaderboard = { id: number; name: string };
type LadderData = {
  leaderboardId: number;
  lastUpdated: string;
  stale: boolean;
  rows: LadderRow[];
};

export default function Home() {
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);
  const [selectedId, setSelectedId] = useState<number>(1);
  const [ladderData, setLadderData] = useState<LadderData | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<keyof LadderRow>("rank");
  const [sortDesc, setSortDesc] = useState(false);

  // Load leaderboards on mount
  useEffect(() => {
    fetch("/api/leaderboards")
      .then(r => r.json())
      .then(data => {
        setLeaderboards(data.items || []);
        if (data.items?.length) setSelectedId(data.items[0].id);
      });
  }, []);

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
    } else {
      comparison = (aVal as number) - (bVal as number);
    }

    return sortDesc ? -comparison : comparison;
  });

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">DoW:DE Top-100 Leaderboard</h1>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(Number(e.target.value))}
          className="px-3 py-2 border rounded"
          disabled={loading}
        >
          {leaderboards.map(lb => (
            <option key={lb.id} value={lb.id}>{lb.name}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search players..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 border rounded flex-1"
        />
      </div>

      {/* Status */}
      {ladderData && (
        <div className="mb-4 text-sm text-gray-600">
          Last updated: {new Date(ladderData.lastUpdated).toLocaleString()}
          {ladderData.stale && (
            <span className="ml-2 px-2 py-1 bg-yellow-200 rounded">Stale Data</span>
          )}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-lg shadow">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: "rank", label: "Rank" },
                  { key: "playerName", label: "Player" },
                  { key: "rating", label: "Rating" },
                  { key: "wins", label: "Wins" },
                  { key: "losses", label: "Losses" },
                  { key: "winrate", label: "Winrate%" },
                  { key: "streak", label: "Streak" },
                ].map(({ key, label }) => (
                  <th
                    key={key}
                    className="px-4 py-3 text-left cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort(key as keyof LadderRow)}
                  >
                    {label}
                    {sortField === key && (
                      <span className="ml-1">{sortDesc ? "↓" : "↑"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, i) => (
                <tr key={row.profileId} className={i % 2 === 0 ? "bg-gray-50" : ""}>
                  <td className="px-4 py-3">{row.rank}</td>
                  <td className={`px-4 py-3 ${row.playerName === "Unknown" ? "text-gray-400" : ""}`}>
                    {row.playerName}
                  </td>
                  <td className="px-4 py-3">{row.rating}</td>
                  <td className="px-4 py-3">{row.wins}</td>
                  <td className="px-4 py-3">{row.losses}</td>
                  <td className="px-4 py-3">{row.winrate}%</td>
                  <td className="px-4 py-3">{row.streak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-gray-500">
        Data from Relic Community API • Updates every 5 minutes
      </div>
    </div>
  );
}