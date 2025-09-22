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

// Mirror the constants from crawl-player-matches.mjs
const JOB_KIND = "player_matches";
const COOLDOWN_MINUTES = Number.parseInt(process.env.CRAWL_COOLDOWN_MINUTES ?? "180", 10);
const JOB_MAX_ATTEMPTS = Number.parseInt(process.env.CRAWL_JOB_MAX_ATTEMPTS ?? "5", 10);

function nowIso() {
  return new Date().toISOString();
}

function formatNumber(num) {
  return num.toLocaleString();
}

function formatPercent(value, total) {
  if (!total) return "0.0%";
  return ((value / total) * 100).toFixed(1) + "%";
}

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h ${mins}m`;
}

function formatTimeUntil(isoString) {
  if (!isoString) return "now";
  const diffMs = new Date(isoString) - new Date();
  if (diffMs <= 0) return "now";
  const diffMinutes = Math.ceil(diffMs / 60000);
  return formatDuration(diffMinutes);
}

async function getJobStats() {
  // Overall job status breakdown
  const { data: statusBreakdown, error: statusError } = await supabase
    .from("crawl_jobs")
    .select("status")
    .eq("kind", JOB_KIND);

  if (statusError) {
    throw new Error(`Failed to get job status breakdown: ${statusError.message}`);
  }

  const stats = {
    pending: 0,
    in_progress: 0,
    done: 0,
    failed: 0,
    total: statusBreakdown.length
  };

  for (const job of statusBreakdown) {
    stats[job.status] = (stats[job.status] || 0) + 1;
  }

  return stats;
}

async function getCooldownStats() {
  const now = nowIso();

  // Detailed pending job analysis
  const { data: pendingJobs, error: pendingError } = await supabase
    .from("crawl_jobs")
    .select("run_after, attempts, priority, last_error, updated_at")
    .eq("kind", JOB_KIND)
    .eq("status", "pending");

  if (pendingError) {
    throw new Error(`Failed to get pending job details: ${pendingError.message}`);
  }

  const readyNow = pendingJobs.filter(job => !job.run_after || job.run_after <= now);
  const onCooldown = pendingJobs.filter(job => job.run_after && job.run_after > now);
  const withErrors = pendingJobs.filter(job => job.last_error);

  // Find next job ready time
  let nextJobTime = null;
  if (onCooldown.length > 0) {
    const sortedCooldown = onCooldown.sort((a, b) => new Date(a.run_after) - new Date(b.run_after));
    nextJobTime = sortedCooldown[0].run_after;
  }

  return {
    readyNow: readyNow.length,
    onCooldown: onCooldown.length,
    withErrors: withErrors.length,
    nextJobTime,
    totalPending: pendingJobs.length
  };
}

async function getRunStats() {
  // Recent crawl run statistics
  const { data: recentRuns, error: runsError } = await supabase
    .from("crawl_runs")
    .select("started_at, finished_at, success, request_count, error_message, notes")
    .order("started_at", { ascending: false })
    .limit(10);

  if (runsError) {
    throw new Error(`Failed to get recent runs: ${runsError.message}`);
  }

  const successfulRuns = recentRuns.filter(run => run.success);
  const failedRuns = recentRuns.filter(run => !run.success);

  const totalRequests = recentRuns.reduce((sum, run) => sum + (run.request_count || 0), 0);
  const avgRequestsPerRun = recentRuns.length > 0 ? Math.round(totalRequests / recentRuns.length) : 0;

  // Calculate processing rate
  let processingRate = 0;
  if (successfulRuns.length >= 2) {
    const latest = new Date(successfulRuns[0].started_at);
    const oldest = new Date(successfulRuns[successfulRuns.length - 1].started_at);
    const timeSpanHours = (latest - oldest) / (1000 * 60 * 60);
    if (timeSpanHours > 0) {
      processingRate = Math.round(successfulRuns.length / timeSpanHours);
    }
  }

  return {
    totalRuns: recentRuns.length,
    successfulRuns: successfulRuns.length,
    failedRuns: failedRuns.length,
    totalRequests,
    avgRequestsPerRun,
    processingRate,
    lastRun: recentRuns[0] || null
  };
}

async function getPlayerDiscoveryStats() {
  // Check how many players have been crawled recently
  const { data: recentPlayers, error: playersError } = await supabase
    .from("players")
    .select("last_seen_at")
    .not("last_seen_at", "is", null)
    .order("last_seen_at", { ascending: false })
    .limit(1000);

  if (playersError) {
    throw new Error(`Failed to get player stats: ${playersError.message}`);
  }

  const now = new Date();
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

  const recentDay = recentPlayers.filter(p => new Date(p.last_seen_at) > oneDayAgo);
  const recentWeek = recentPlayers.filter(p => new Date(p.last_seen_at) > oneWeekAgo);

  return {
    recentDay: recentDay.length,
    recentWeek: recentWeek.length,
    totalWithActivity: recentPlayers.length
  };
}

async function getStuckJobStats() {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const { data: stuckJobs, error: stuckError } = await supabase
    .from("crawl_jobs")
    .select("id, payload, attempts, updated_at, last_error")
    .eq("kind", JOB_KIND)
    .eq("status", "in_progress")
    .lt("updated_at", fiveMinutesAgo);

  if (stuckError) {
    throw new Error(`Failed to get stuck jobs: ${stuckError.message}`);
  }

  return {
    stuckJobs: stuckJobs.length,
    stuckJobDetails: stuckJobs.slice(0, 5) // Show first 5 for debugging
  };
}

async function showStatus() {
  try {
    console.clear();
    console.log("🔍 Dawn of War Match Crawler Status");
    console.log("=" + "=".repeat(48));
    console.log();

    const [jobStats, cooldownStats, runStats, playerStats, stuckStats] = await Promise.all([
      getJobStats(),
      getCooldownStats(),
      getRunStats(),
      getPlayerDiscoveryStats(),
      getStuckJobStats()
    ]);

    // Job Queue Overview
    console.log("📊 Job Queue Status:");
    console.log(`   Total Jobs:           ${formatNumber(jobStats.total)}`);
    console.log(`   ✅ Completed:         ${formatNumber(jobStats.done)} (${formatPercent(jobStats.done, jobStats.total)})`);
    console.log(`   ⏳ Pending:           ${formatNumber(jobStats.pending)} (${formatPercent(jobStats.pending, jobStats.total)})`);
    console.log(`   🔄 In Progress:       ${formatNumber(jobStats.in_progress)}`);
    console.log(`   ❌ Failed:            ${formatNumber(jobStats.failed)}`);
    console.log();

    // Pending Job Details
    if (jobStats.pending > 0) {
      console.log("⏳ Pending Job Details:");
      console.log(`   Ready to Process:     ${formatNumber(cooldownStats.readyNow)}`);
      console.log(`   On Cooldown:          ${formatNumber(cooldownStats.onCooldown)}`);
      console.log(`   With Previous Errors: ${formatNumber(cooldownStats.withErrors)}`);

      if (cooldownStats.nextJobTime) {
        console.log(`   Next Job Ready:       ${formatTimeUntil(cooldownStats.nextJobTime)}`);
      }
      console.log();
    }

    // Stuck Jobs Warning
    if (stuckStats.stuckJobs > 0) {
      console.log("⚠️  Stuck Jobs Detected:");
      console.log(`   Jobs stuck >5min:     ${formatNumber(stuckStats.stuckJobs)}`);
      console.log("   💡 Run cleanup: UPDATE crawl_jobs SET status='pending' WHERE status='in_progress';");
      console.log();
    }

    // Recent Activity
    console.log("📈 Recent Activity:");
    console.log(`   Last 10 Runs:         ${runStats.successfulRuns}/${runStats.totalRuns} successful`);
    console.log(`   Avg API Calls/Run:    ${runStats.avgRequestsPerRun}`);
    console.log(`   Processing Rate:      ~${runStats.processingRate} jobs/hour`);
    console.log();

    // Player Discovery
    console.log("👥 Player Activity:");
    console.log(`   Seen Last 24h:        ${formatNumber(playerStats.recentDay)} players`);
    console.log(`   Seen Last Week:       ${formatNumber(playerStats.recentWeek)} players`);
    console.log();

    // Last Run Details
    if (runStats.lastRun) {
      const lastRun = runStats.lastRun;
      const status = lastRun.success ? "✅ Success" : "❌ Failed";
      const duration = lastRun.finished_at
        ? Math.round((new Date(lastRun.finished_at) - new Date(lastRun.started_at)) / 1000) + "s"
        : "ongoing";

      console.log("🔄 Last Run:");
      console.log(`   Status:               ${status}`);
      console.log(`   Started:              ${new Date(lastRun.started_at).toLocaleString()}`);
      console.log(`   Duration:             ${duration}`);
      console.log(`   API Requests:         ${lastRun.request_count || 0}`);
      if (lastRun.notes) {
        console.log(`   Notes:                ${lastRun.notes}`);
      }
      if (lastRun.error_message) {
        console.log(`   Error:                ${lastRun.error_message}`);
      }
      console.log();
    }

    // Overall Status Assessment
    console.log("🎯 Status Assessment:");
    if (cooldownStats.readyNow > 0) {
      console.log("   🟢 ACTIVE - Jobs ready to process");
    } else if (cooldownStats.onCooldown > 0) {
      console.log(`   🟡 WAITING - All jobs on cooldown (next ready in ${formatTimeUntil(cooldownStats.nextJobTime)})`);
    } else if (jobStats.pending === 0 && jobStats.in_progress === 0) {
      console.log("   ✅ COMPLETE - All jobs finished");
    } else if (stuckStats.stuckJobs > 0) {
      console.log("   ⚠️  STUCK - Some jobs need manual reset");
    } else {
      console.log("   ⏳ PROCESSING - Jobs in progress");
    }

    console.log();
    console.log(`⏰ Last updated: ${new Date().toLocaleTimeString()}`);
    console.log("💡 Use 'npm run crawl:status -- --watch' for live monitoring");

  } catch (error) {
    console.error("Error fetching crawl status:", error.message);
    process.exit(1);
  }
}

async function watchMode() {
  console.log("👁️  Starting live monitoring (press Ctrl+C to exit)...\n");

  await showStatus();

  const interval = setInterval(showStatus, 15000); // Update every 15 seconds

  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log("\n👋 Monitoring stopped");
    process.exit(0);
  });
}

// Check for --watch flag
const watchFlag = process.argv.includes('--watch') || process.argv.includes('-w');

if (watchFlag) {
  watchMode().catch(err => {
    console.error("Watch mode failed:", err);
    process.exit(1);
  });
} else {
  showStatus().catch(err => {
    console.error("Status check failed:", err);
    process.exit(1);
  });
}