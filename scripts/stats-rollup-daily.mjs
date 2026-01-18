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

function parseDateInput(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    console.error(`${label} must be YYYY-MM-DD (got ${value}).`);
    process.exit(1);
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) {
    console.error(`Invalid ${label} value: ${value}`);
    process.exit(1);
  }
  return date;
}

function formatDate(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getDefaultRange(days) {
  const today = new Date();
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const endDate = utcToday;
  const startDate = addDays(endDate, -(days - 1));
  return { startDate, endDate };
}

async function main() {
  const { values } = parseArgs({
    options: {
      start: { type: "string" },
      end: { type: "string" },
      days: { type: "string" },
      dryRun: { type: "boolean", default: false }
    }
  });

  const missing = requiredEnv.filter(name => !process.env[name]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  const parsedStart = parseDateInput(values.start, "--start");
  const parsedEnd = parseDateInput(values.end, "--end") ?? parsedStart;

  const rangeDays = values.days ? Number(values.days) : 7;
  if (values.days && (!Number.isFinite(rangeDays) || rangeDays < 1)) {
    console.error("--days must be a positive integer.");
    process.exit(1);
  }

  const { startDate, endDate } = parsedStart
    ? { startDate: parsedStart, endDate: parsedEnd }
    : getDefaultRange(rangeDays);

  if (endDate < startDate) {
    console.error("End date must be on or after start date.");
    process.exit(1);
  }

  console.log(`Rolling up stats for ${formatDate(startDate)} -> ${formatDate(endDate)}.`);

  if (values.dryRun) {
    return;
  }

  const supabase = createClient(
    getEnv("SUPABASE_URL"),
    getEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );

  const { error } = await supabase.rpc("stats_rollup_daily", {
    p_start: formatDate(startDate),
    p_end: formatDate(endDate)
  });

  if (error) {
    console.error("stats_rollup_daily failed:", error);
    process.exit(1);
  }

  console.log("Daily rollup complete.");
}

main().catch(error => {
  console.error("Daily rollup failed:", error);
  process.exit(1);
});
