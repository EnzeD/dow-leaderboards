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

async function main() {
  const { values } = parseArgs({
    options: {
      keepDays: { type: "string" },
      dryRun: { type: "boolean", default: false }
    }
  });

  const keepDays = values.keepDays ? Number(values.keepDays) : 7;
  if (!Number.isFinite(keepDays) || keepDays < 1) {
    console.error("--keepDays must be a positive integer.");
    process.exit(1);
  }

  const missing = requiredEnv.filter(name => !process.env[name]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log(`Pruning matches older than ${keepDays} day(s).`);

  if (values.dryRun) return;

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const { error } = await supabase.rpc("prune_match_history", {
    p_keep_days: keepDays
  });

  if (error) {
    console.error("prune_match_history failed:", error);
    process.exit(1);
  }

  console.log("Prune complete.");
}

main().catch(error => {
  console.error("Prune failed:", error);
  process.exit(1);
});
