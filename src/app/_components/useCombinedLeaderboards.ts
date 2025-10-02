"use client";

import { useEffect, useState } from "react";
import { Leaderboard } from "@/lib/relic";

export const useCombinedLeaderboards = () => {
  const [leaderboards, setLeaderboards] = useState<Leaderboard[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchLeaderboards = async () => {
      try {
        const response = await fetch("/api/leaderboards");
        if (!response.ok) return;
        const data = (await response.json()) as { items?: Leaderboard[] };
        if (!cancelled) {
          setLeaderboards(data.items || []);
        }
      } catch (error) {
        console.warn("Failed to load leaderboards", error);
      }
    };

    fetchLeaderboards();

    return () => {
      cancelled = true;
    };
  }, []);

  return leaderboards;
};
