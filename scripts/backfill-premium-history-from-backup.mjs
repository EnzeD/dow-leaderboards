#!/usr/bin/env node

import { config as loadEnv } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createReadStream } from "node:fs";
import { createGunzip } from "node:zlib";
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

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        current += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current);
  return result;
}

async function streamLines(path, onLine) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(path).pipe(createGunzip());
    let buffer = "";
    let running = Promise.resolve();
    stream.on("data", chunk => {
      buffer += chunk.toString("utf8");
      let idx;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        running = running.then(() => onLine(line)).catch(reject);
      }
    });
    stream.on("end", () => {
      if (buffer.length > 0) {
        running = running.then(() => onLine(buffer));
      }
      running.then(resolve).catch(reject);
    });
    stream.on("error", reject);
  });
}

async function fetchPremiumProfiles(supabase) {
  const { data, error } = await supabase
    .from("premium_subscriptions")
    .select("status, current_period_end, app_users!inner(primary_profile_id)");

  if (error) {
    throw error;
  }

  const active = new Set();
  for (const row of data ?? []) {
    const profileId = row.app_users?.primary_profile_id;
    if (!profileId) continue;
    const status = row.status;
    if (!["active", "trialing", "past_due"].includes(status)) continue;
    if (row.current_period_end) {
      const expiry = Date.parse(row.current_period_end);
      if (!Number.isNaN(expiry) && expiry <= Date.now()) {
        continue;
      }
    }
    active.add(String(profileId));
  }

  return active;
}

async function main() {
  const { values } = parseArgs({
    options: {
      backup: { type: "string" },
      batchSize: { type: "string" },
      dryRun: { type: "boolean", default: false }
    }
  });

  const backupPath =
    values.backup ??
    "/home/enzed/dow-leaderboards/backups/matches_match_participants_20260117T191444Z.sql.gz";
  const batchSize = values.batchSize ? Number(values.batchSize) : 500;

  if (!Number.isFinite(batchSize) || batchSize < 1) {
    console.error("--batchSize must be a positive integer.");
    process.exit(1);
  }

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

  const premiumProfiles = await fetchPremiumProfiles(supabase);
  if (!premiumProfiles.size) {
    console.log("No active premium profiles found. Exiting.");
    return;
  }

  console.log(`Found ${premiumProfiles.size} active premium profile(s).`);
  console.log("Scanning backup for match ids...");

  const matchIds = new Set();
  let inParticipants = false;
  let participantRows = 0;

  await streamLines(backupPath, line => {
    if (line.startsWith("COPY public.match_participants")) {
      inParticipants = true;
      return;
    }
    if (inParticipants && line === "\\.") {
      inParticipants = false;
      return;
    }
    if (!inParticipants || !line) return;

    const cols = parseCsvLine(line);
    const matchId = cols[0];
    const profileId = cols[1];
    participantRows += 1;
    if (premiumProfiles.has(profileId)) {
      matchIds.add(matchId);
    }
  });

  console.log(`Found ${matchIds.size} match(es) involving premium profiles.`);
  if (values.dryRun) return;

  let inMatches = false;
  inParticipants = false;
  let matchBatch = [];
  let participantBatch = [];
  let matchesInserted = 0;
  let participantsInserted = 0;

  async function flushMatches() {
    if (!matchBatch.length) return;
    const { error } = await supabase
      .from("premium_matches")
      .upsert(matchBatch, { onConflict: "match_id" });
    if (error) throw error;
    matchesInserted += matchBatch.length;
    matchBatch = [];
  }

  async function flushParticipants() {
    if (!participantBatch.length) return;
    const { error } = await supabase
      .from("premium_match_participants")
      .upsert(participantBatch, { onConflict: "match_id,profile_id" });
    if (error) throw error;
    participantsInserted += participantBatch.length;
    participantBatch = [];
  }

  console.log("Backfilling premium matches and participants...");

  await streamLines(backupPath, async line => {
    if (line.startsWith("COPY public.matches")) {
      inMatches = true;
      return;
    }
    if (line.startsWith("COPY public.match_participants")) {
      inParticipants = true;
      return;
    }
    if (line === "\\.") {
      if (inMatches) {
        inMatches = false;
        await flushMatches();
      }
      if (inParticipants) {
        inParticipants = false;
        await flushParticipants();
      }
      return;
    }
    if (!line) return;

    if (inMatches) {
      const cols = parseCsvLine(line);
      const matchId = cols[0];
      if (!matchIds.has(matchId)) return;

      const matchTypeId = cols[1] ? Number(cols[1]) : null;
      const mapName = cols[2] || null;
      const maxPlayers = cols[4] ? Number(cols[4]) : null;
      const creatorProfileId = cols[5] ? Number(cols[5]) : null;
      const startedAt = cols[6] || null;
      const completedAt = cols[7] || null;
      const durationSeconds = cols[8] ? Number(cols[8]) : null;
      const crawledAt = cols[10] || null;
      const sourceAlias = cols[11] || null;

      matchBatch.push({
        match_id: Number(matchId),
        match_type_id: matchTypeId,
        map_name: mapName,
        max_players: maxPlayers,
        creator_profile_id: creatorProfileId,
        started_at: startedAt,
        completed_at: completedAt,
        duration_seconds: durationSeconds,
        crawled_at: crawledAt,
        source_alias: sourceAlias
      });

      if (matchBatch.length >= batchSize) {
        await flushMatches();
      }
      return;
    }

    if (inParticipants) {
      const cols = parseCsvLine(line);
      const matchId = cols[0];
      if (!matchIds.has(matchId)) return;

      const profileId = cols[1] ? Number(cols[1]) : null;
      const teamId = cols[2] ? Number(cols[2]) : null;
      const raceId = cols[3] ? Number(cols[3]) : null;
      const aliasAtMatch = cols[5] || null;
      const outcome = cols[6] || null;
      const oldRating = cols[13] ? Number(cols[13]) : null;
      const newRating = cols[14] ? Number(cols[14]) : null;
      const ratingDelta = cols[15] ? Number(cols[15]) : null;
      const isComputer = cols[16] ? cols[16] === "true" || cols[16] === "t" : false;

      participantBatch.push({
        match_id: Number(matchId),
        profile_id: profileId,
        team_id: teamId,
        race_id: raceId,
        alias_at_match: aliasAtMatch,
        outcome,
        old_rating: oldRating,
        new_rating: newRating,
        rating_delta: ratingDelta,
        is_computer: isComputer
      });

      if (participantBatch.length >= batchSize) {
        await flushParticipants();
      }
    }
  });

  await flushMatches();
  await flushParticipants();

  console.log(
    `Backfill complete. matches=${matchesInserted}, participants=${participantsInserted}`
  );
}

main().catch(error => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
