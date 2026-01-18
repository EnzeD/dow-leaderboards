#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";

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
  const missing = requiredEnv.filter(name => !process.env[name]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const { error } = await supabase.rpc("stats_refresh_global_from_daily");
  if (error) {
    console.error("stats_refresh_global_from_daily failed:", error);
    process.exit(1);
  }

  console.log("Stats refresh complete.");
}

main().catch(error => {
  console.error("Stats refresh failed:", error);
  process.exit(1);
});
