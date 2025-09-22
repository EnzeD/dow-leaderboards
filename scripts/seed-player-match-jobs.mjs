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

const PLAYER_BATCH_SIZE = Number.parseInt(process.env.SEED_PLAYER_BATCH_SIZE ?? "500", 10);
const JOB_BATCH_SIZE = Number.parseInt(process.env.SEED_JOB_BATCH_SIZE ?? "100", 10);
const MAX_PLAYERS = Number.parseInt(process.env.SEED_PLAYER_LIMIT ?? "0", 10);
const JOB_PRIORITY = Number.parseInt(process.env.SEED_JOB_PRIORITY ?? "5", 10);
const KIND = "player_matches";

function isDuplicateError(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = String(error.message ?? "");
  return message.includes("duplicate key value") || message.includes("already exists");
}

async function insertJobs(rows) {
  if (!rows.length) return { inserted: 0, skipped: 0 };
  const res = await supabase
    .from("crawl_jobs")
    .insert(rows, { returning: "minimal" });

  if (!res.error) {
    return { inserted: rows.length, skipped: 0 };
  }

  if (isDuplicateError(res.error) && rows.length > 1) {
    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const outcome = await insertJobs([row]);
      inserted += outcome.inserted;
      skipped += outcome.skipped;
    }
    return { inserted, skipped };
  }

  if (isDuplicateError(res.error)) {
    return { inserted: 0, skipped: 1 };
  }

  throw new Error(`Failed to enqueue jobs: ${res.error.message}`);
}

async function main() {
  console.log("Seeding player match crawl jobs...");
  let offset = 0;
  let totalPlayers = 0;
  let totalInserted = 0;
  let totalSkipped = 0;

  while (true) {
    const upper = offset + PLAYER_BATCH_SIZE - 1;
    const query = await supabase
      .from("players")
      .select("profile_id,current_alias")
      .order("profile_id", { ascending: true })
      .range(offset, upper);

    if (query.error) {
      throw new Error(`Failed to fetch players: ${query.error.message}`);
    }

    const players = query.data ?? [];
    if (!players.length) break;

    for (let idx = 0; idx < players.length; idx += JOB_BATCH_SIZE) {
      const slice = players.slice(idx, idx + JOB_BATCH_SIZE);
      const rows = slice.map(player => ({
        kind: KIND,
        payload: {
          profile_id: String(player.profile_id ?? ""),
          alias: typeof player.current_alias === "string" ? player.current_alias : null
        },
        priority: JOB_PRIORITY
      }));
      const outcome = await insertJobs(rows);
      totalInserted += outcome.inserted;
      totalSkipped += outcome.skipped;
    }

    totalPlayers += players.length;
    offset += players.length;

    if (MAX_PLAYERS && totalPlayers >= MAX_PLAYERS) {
      break;
    }
  }

  console.log(`Job enqueue complete. Players scanned: ${totalPlayers}. Jobs inserted: ${totalInserted}. Skipped (duplicates): ${totalSkipped}.`);
}

main().catch(err => {
  console.error("Seeding script failed:", err);
  process.exit(1);
});
