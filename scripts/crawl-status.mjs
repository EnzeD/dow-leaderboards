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
  // Use count queries to avoid hitting row limits
  const [pendingResult, inProgressResult, doneResult, failedResult, totalResult] = await Promise.all([
    supabase.from("crawl_jobs").select("*", { count: "exact", head: true })
      .eq("kind", JOB_KIND).eq("status", "pending"),
    supabase.from("crawl_jobs").select("*", { count: "exact", head: true })
      .eq("kind", JOB_KIND).eq("status", "in_progress"),
    supabase.from("crawl_jobs").select("*", { count: "exact", head: true })
      .eq("kind", JOB_KIND).eq("status", "done"),
    supabase.from("crawl_jobs").select("*", { count: "exact", head: true })
      .eq("kind", JOB_KIND).eq("status", "failed"),
    supabase.from("crawl_jobs").select("*", { count: "exact", head: true })
      .eq("kind", JOB_KIND)
  ]);

  if (pendingResult.error || inProgressResult.error || doneResult.error || failedResult.error || totalResult.error) {
    const errorMsg = [pendingResult.error, inProgressResult.error, doneResult.error, failedResult.error, totalResult.error]
      .filter(Boolean).map(err => err.message).join(', ');
    throw new Error(`Failed to get job status breakdown: ${errorMsg}`);
  }

  const stats = {
    pending: pendingResult.count || 0,
    in_progress: inProgressResult.count || 0,
    done: doneResult.count || 0,
    failed: failedResult.count || 0,
    total: totalResult.count || 0
  };

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
  // Use count queries to avoid row limits
  const [totalResult, everCrawledResult, recentDayResult, recentWeekResult] = await Promise.all([
    supabase.from("players").select("*", { count: "exact", head: true }),
    supabase.from("players").select("*", { count: "exact", head: true })
      .not("last_seen_at", "is", null),
    supabase.from("players").select("*", { count: "exact", head: true })
      .not("last_seen_at", "is", null)
      .gte("last_seen_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    supabase.from("players").select("*", { count: "exact", head: true })
      .not("last_seen_at", "is", null)
      .gte("last_seen_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  ]);

  if (totalResult.error || everCrawledResult.error || recentDayResult.error || recentWeekResult.error) {
    const errorMsg = [totalResult.error, everCrawledResult.error, recentDayResult.error, recentWeekResult.error]
      .filter(Boolean).map(err => err.message).join(', ');
    throw new Error(`Failed to get player stats: ${errorMsg}`);
  }

  const totalPlayers = totalResult.count || 0;
  const totalWithActivity = everCrawledResult.count || 0;
  const recentDay = recentDayResult.count || 0;
  const recentWeek = recentWeekResult.count || 0;

  return {
    totalPlayers,
    recentDay,
    recentWeek,
    totalWithActivity,
    neverCrawled: totalPlayers - totalWithActivity
  };
}

async function getMatchDataStats() {
  // Get basic match data counts
  const [matchesResult, participantsResult, uniqueParticipantsResult] = await Promise.all([
    supabase.from("matches").select("*", { count: "exact", head: true }),
    supabase.from("match_participants").select("*", { count: "exact", head: true }),
    supabase.from("match_participants").select("profile_id", { count: "exact", head: true })
  ]);

  const totalMatches = matchesResult.count || 0;
  const totalParticipants = participantsResult.count || 0;

  // Get unique participants (this might be slow but necessary)
  let uniqueParticipants = 0;
  let participantsInPlayerDb = 0;
  let missingFromPlayerDb = 0;

  if (totalParticipants > 0) {
    try {
      // Try the efficient RPC function first
      const { data: rpcResult, error: rpcError } = await supabase
        .rpc('get_unique_participant_count');

      if (!rpcError && rpcResult) {
        uniqueParticipants = parseInt(rpcResult.total_participants) || 0;
        participantsInPlayerDb = parseInt(rpcResult.participants_in_players_db) || 0;
        missingFromPlayerDb = uniqueParticipants - participantsInPlayerDb;
      } else {
        // Fallback to manual query with DISTINCT
        const { data: distinctResult, error: distinctError } = await supabase
          .from("match_participants")
          .select("profile_id")
          .limit(5000); // Reasonable limit to avoid timeouts

        if (!distinctError && distinctResult) {
          const uniqueProfiles = [...new Set(distinctResult.map(p => p.profile_id))];
          uniqueParticipants = uniqueProfiles.length;

          // Check how many exist in players table
          if (uniqueProfiles.length > 0) {
            const chunks = [];
            for (let i = 0; i < uniqueProfiles.length; i += 500) {
              chunks.push(uniqueProfiles.slice(i, i + 500));
            }

            let foundCount = 0;
            for (const chunk of chunks.slice(0, 10)) { // Process up to 5000 profiles
              const { count } = await supabase
                .from("players")
                .select("*", { count: "exact", head: true })
                .in("profile_id", chunk);
              foundCount += count || 0;
            }
            participantsInPlayerDb = foundCount;
            missingFromPlayerDb = uniqueParticipants - participantsInPlayerDb;
          }
        }
      }
    } catch (err) {
      console.warn("Failed to calculate participant coverage:", err.message);
    }
  }

  const coveragePercent = uniqueParticipants > 0 ?
    Math.round((participantsInPlayerDb / uniqueParticipants) * 100) : 0;

  return {
    totalMatches,
    totalParticipants,
    uniqueParticipants,
    participantsInPlayerDb,
    missingFromPlayerDb,
    coveragePercent,
    hasMatchData: totalMatches > 0
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

    const [jobStats, cooldownStats, runStats, playerStats, stuckStats, matchDataStats] = await Promise.all([
      getJobStats(),
      getCooldownStats(),
      getRunStats(),
      getPlayerDiscoveryStats(),
      getStuckJobStats(),
      getMatchDataStats()
    ]);

    // Job Queue Overview
    console.log("📊 Job Queue Status:");
    console.log(`   Total Jobs:           ${formatNumber(jobStats.total)}`);
    console.log(`   ✅ Completed:         ${formatNumber(jobStats.done)} (${formatPercent(jobStats.done, jobStats.total)})`);
    console.log(`   ⏳ Pending:           ${formatNumber(jobStats.pending)} (${formatPercent(jobStats.pending, jobStats.total)})`);
    console.log(`   🔄 In Progress:       ${formatNumber(jobStats.in_progress)}`);
    console.log(`   ❌ Failed:            ${formatNumber(jobStats.failed)}`);

    if (jobStats.total < 2000) {
      console.log(`   💡 Note:              Low job count suggests crawling hasn't grown yet`);
      console.log(`                         (Successfully completed jobs create new jobs)`);
    }
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

    // Player Discovery & Coverage
    console.log("👥 Player Database Coverage:");
    console.log(`   Total Players:        ${formatNumber(playerStats.totalPlayers)}`);
    console.log(`   Ever Crawled:         ${formatNumber(playerStats.totalWithActivity)} (${formatPercent(playerStats.totalWithActivity, playerStats.totalPlayers)})`);
    console.log(`   Never Crawled:        ${formatNumber(playerStats.neverCrawled)} (${formatPercent(playerStats.neverCrawled, playerStats.totalPlayers)})`);
    console.log(`   Seen Last 24h:        ${formatNumber(playerStats.recentDay)} players`);
    console.log(`   Seen Last Week:       ${formatNumber(playerStats.recentWeek)} players`);
    console.log();

    // Match Data & Participant Coverage
    console.log("📈 Match Data Status:");
    if (!matchDataStats.hasMatchData) {
      console.log("   Status:               ⚠️  No match data collected yet");
      console.log("   Reason:               Jobs failing or not completing successfully");
      console.log("   Solution:             Fix failing jobs, run cleanup if needed");
    } else {
      console.log(`   Total Matches:        ${formatNumber(matchDataStats.totalMatches)}`);
      console.log(`   Match Participants:   ${formatNumber(matchDataStats.totalParticipants)} total`);
      console.log(`   Unique Players:       ${formatNumber(matchDataStats.uniqueParticipants)} in matches`);
      console.log(`   Found in Players DB:  ${formatNumber(matchDataStats.participantsInPlayerDb)} (${matchDataStats.coveragePercent}%)`);

      if (matchDataStats.missingFromPlayerDb > 0) {
        console.log(`   Missing from DB:      ${formatNumber(matchDataStats.missingFromPlayerDb)} players need to be added`);
      }
    }
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