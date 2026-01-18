#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseArgs } from "node:util";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local" });

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var ${name}`);
    process.exit(1);
  }
  return value;
}

function parseSince(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    console.error(`--since must be a valid date (got ${value}).`);
    process.exit(1);
  }
  return date.toISOString();
}

async function main() {
  const { values } = parseArgs({
    options: {
      days: { type: "string" },
      since: { type: "string" },
      all: { type: "boolean", default: false },
      dryRun: { type: "boolean", default: false }
    }
  });

  const missing = requiredEnv.filter(name => !process.env[name]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  let since = null;
  if (!values.all) {
    if (values.since) {
      since = parseSince(values.since);
    } else {
      const days = values.days ? Number(values.days) : 7;
      if (!Number.isFinite(days) || days < 1) {
        console.error("--days must be a positive integer.");
        process.exit(1);
      }
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      since = cutoff.toISOString();
    }
  }

  if (since) {
    console.log(`Syncing premium match history since ${since}.`);
  } else {
    console.log("Syncing premium match history for all retained matches.");
  }

  if (values.dryRun) return;

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const params = since ? { p_since: since } : {};
  const { error } = await supabase.rpc("sync_premium_match_history", params);

  if (error) {
    console.error("sync_premium_match_history failed:", error);
    process.exit(1);
  }

  console.log("Premium match history sync complete.");
}

main().catch(error => {
  console.error("Sync failed:", error);
  process.exit(1);
});
