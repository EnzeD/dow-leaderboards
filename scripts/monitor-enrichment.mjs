#!/usr/bin/env node

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) environment variable");
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function getEnrichmentStats() {
  // Total players
  const { count: totalPlayers, error: totalError } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true });

  if (totalError) {
    throw new Error(`Failed to count total players: ${totalError.message}`);
  }

  // Players needing enrichment (missing any of: steam_id64, level, xp)
  const { count: needingEnrichment, error: needingError } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .or("steam_id64.is.null,level.is.null,xp.is.null");

  if (needingError) {
    throw new Error(`Failed to count players needing enrichment: ${needingError.message}`);
  }

  // Players with steam_id64
  const { count: withSteamId, error: steamError } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .not("steam_id64", "is", null);

  if (steamError) {
    throw new Error(`Failed to count players with steam_id64: ${steamError.message}`);
  }

  // Players with level
  const { count: withLevel, error: levelError } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .not("level", "is", null);

  if (levelError) {
    throw new Error(`Failed to count players with level: ${levelError.message}`);
  }

  // Players with xp
  const { count: withXp, error: xpError } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .not("xp", "is", null);

  if (xpError) {
    throw new Error(`Failed to count players with xp: ${xpError.message}`);
  }

  // Players fully enriched (have all three)
  const { count: fullyEnriched, error: enrichedError } = await supabase
    .from("players")
    .select("*", { count: "exact", head: true })
    .not("steam_id64", "is", null)
    .not("level", "is", null)
    .not("xp", "is", null);

  if (enrichedError) {
    throw new Error(`Failed to count fully enriched players: ${enrichedError.message}`);
  }

  return {
    totalPlayers,
    needingEnrichment,
    withSteamId,
    withLevel,
    withXp,
    fullyEnriched
  };
}

function formatPercent(value, total) {
  if (!total) return "0.0%";
  return ((value / total) * 100).toFixed(1) + "%";
}

function formatNumber(num) {
  return num.toLocaleString();
}

async function showStats() {
  try {
    const stats = await getEnrichmentStats();

    console.clear();
    console.log("🎯 Dawn of War Player Enrichment Monitor");
    console.log("=" + "=".repeat(48));
    console.log();

    console.log("📊 Overall Progress:");
    console.log(`   Total Players:        ${formatNumber(stats.totalPlayers)}`);
    console.log(`   Fully Enriched:       ${formatNumber(stats.fullyEnriched)} (${formatPercent(stats.fullyEnriched, stats.totalPlayers)})`);
    console.log(`   Still Need Work:      ${formatNumber(stats.needingEnrichment)} (${formatPercent(stats.needingEnrichment, stats.totalPlayers)})`);
    console.log();

    console.log("🔍 Field Completion:");
    console.log(`   Have Steam ID:        ${formatNumber(stats.withSteamId)} (${formatPercent(stats.withSteamId, stats.totalPlayers)})`);
    console.log(`   Have Level:           ${formatNumber(stats.withLevel)} (${formatPercent(stats.withLevel, stats.totalPlayers)})`);
    console.log(`   Have XP:              ${formatNumber(stats.withXp)} (${formatPercent(stats.withXp, stats.totalPlayers)})`);
    console.log();

    // Progress bar for overall enrichment
    const progressPercent = Math.round((stats.fullyEnriched / stats.totalPlayers) * 100);
    const barLength = 30;
    const filledLength = Math.round((progressPercent / 100) * barLength);
    const bar = "█".repeat(filledLength) + "░".repeat(barLength - filledLength);
    console.log(`📈 Progress: [${bar}] ${progressPercent}%`);
    console.log();

    // ETA calculation (rough estimate)
    if (stats.needingEnrichment > 0) {
      const avgTimePerPlayer = 0.6; // seconds (conservative estimate with optimized settings)
      const concurrency = 10; // from our optimized settings
      const estimatedSecondsRemaining = (stats.needingEnrichment * avgTimePerPlayer) / concurrency;
      const estimatedMinutesRemaining = Math.ceil(estimatedSecondsRemaining / 60);
      console.log(`⏱️  Estimated time remaining: ~${estimatedMinutesRemaining} minutes`);
    } else {
      console.log("🎉 Enrichment Complete!");
    }

    console.log();
    console.log(`Last updated: ${new Date().toLocaleTimeString()}`);
    console.log("Press Ctrl+C to exit");

  } catch (error) {
    console.error("Error fetching enrichment stats:", error.message);
  }
}

async function monitor() {
  // Show initial stats
  await showStats();

  // Update every 10 seconds
  const interval = setInterval(showStats, 10000);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log("\n👋 Monitoring stopped");
    process.exit(0);
  });
}

monitor().catch(err => {
  console.error("Monitor failed:", err);
  process.exit(1);
});