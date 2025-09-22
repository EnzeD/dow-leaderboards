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

const JOB_KIND = "player_matches";

async function cleanupStuckJobs() {
  console.log("🧹 Cleaning up stuck crawl jobs...");

  // Find jobs stuck for more than 5 minutes
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  // First, check what we're about to clean
  const { data: stuckJobs, error: checkError } = await supabase
    .from("crawl_jobs")
    .select("id, payload, attempts, updated_at, last_error")
    .eq("kind", JOB_KIND)
    .eq("status", "in_progress")
    .lt("updated_at", fiveMinutesAgo);

  if (checkError) {
    console.error("❌ Failed to check for stuck jobs:", checkError.message);
    process.exit(1);
  }

  if (stuckJobs.length === 0) {
    console.log("✅ No stuck jobs found. All good!");
    return;
  }

  console.log(`📋 Found ${stuckJobs.length} stuck jobs:`);
  for (const job of stuckJobs.slice(0, 5)) {
    const profileId = job.payload?.profile_id || 'unknown';
    const stuckMinutes = Math.round((new Date() - new Date(job.updated_at)) / 60000);
    console.log(`   Job ${job.id}: Profile ${profileId} (stuck for ${stuckMinutes}m)`);
  }

  if (stuckJobs.length > 5) {
    console.log(`   ... and ${stuckJobs.length - 5} more`);
  }

  // Reset stuck jobs to pending
  const { error: resetError } = await supabase
    .from("crawl_jobs")
    .update({
      status: "pending",
      last_error: "Reset after being stuck in progress",
      updated_at: new Date().toISOString()
    })
    .eq("kind", JOB_KIND)
    .eq("status", "in_progress")
    .lt("updated_at", fiveMinutesAgo);

  if (resetError) {
    console.error("❌ Failed to reset stuck jobs:", resetError.message);
    process.exit(1);
  }

  console.log(`✅ Successfully reset ${stuckJobs.length} stuck jobs to pending status`);
  console.log("🚀 You can now safely restart the crawler");
}

async function main() {
  try {
    await cleanupStuckJobs();
  } catch (error) {
    console.error("❌ Cleanup failed:", error.message);
    process.exit(1);
  }
}

main();