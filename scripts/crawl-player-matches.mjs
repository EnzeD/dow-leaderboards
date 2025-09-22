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

const RELIC_BASE = "https://dow-api.reliclink.com";
const JOB_KIND = "player_matches";
const RELIC_DELAY_MS = Number.parseInt(process.env.CRAWL_RELIC_DELAY_MS ?? "350", 10);
const RELIC_REQUEST_CAP = Number.parseInt(process.env.CRAWL_RELIC_REQUEST_CAP ?? "6000", 10);
const JOB_MAX_ATTEMPTS = Number.parseInt(process.env.CRAWL_JOB_MAX_ATTEMPTS ?? "5", 10);
const COOLDOWN_MINUTES = Number.parseInt(process.env.CRAWL_COOLDOWN_MINUTES ?? "180", 10);
const UPSERT_CHUNK_SIZE = Number.parseInt(process.env.CRAWL_UPSERT_CHUNK_SIZE ?? "300", 10);
const IDLE_SLEEP_MS = Number.parseInt(process.env.CRAWL_IDLE_SLEEP_MS ?? "3000", 10);
const EXIT_ON_IDLE = process.env.CRAWL_EXIT_ON_IDLE === "true";
const DISCOVERY_PRIORITY = Number.parseInt(process.env.CRAWL_DISCOVERY_PRIORITY ?? "12", 10);
const JOB_PRIORITY_FLOOR = Number.parseInt(process.env.CRAWL_JOB_PRIORITY_FLOOR ?? "5", 10);
const JOB_PRIORITY_CEIL = Number.parseInt(process.env.CRAWL_JOB_PRIORITY_CEIL ?? "15", 10);
const MAX_MATCHES = Number.parseInt(process.env.CRAWL_MATCH_LIMIT ?? "200", 10);

let relicRequestCount = 0;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function parseBigIntish(value) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  if (!str.trim()) return null;
  return str;
}

function secToIso(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return new Date(num * 1000).toISOString();
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function determineOutcome(raw) {
  if (raw === 1 || raw === "1") return "win";
  if (raw === 0 || raw === "0") return "loss";
  return "unknown";
}

function isDuplicateError(error) {
  if (!error) return false;
  if (error.code === "23505") return true;
  const message = String(error.message ?? "");
  return message.includes("duplicate key value") || message.includes("already exists");
}

async function fetchRelicJson(url, context) {
  if (relicRequestCount >= RELIC_REQUEST_CAP) {
    throw new Error(`Relic request cap (${RELIC_REQUEST_CAP}) reached while fetching ${context}`);
  }
  relicRequestCount += 1;
  const res = await fetch(url, { headers: { "User-Agent": "dow1-de-match-crawler" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "<failed to read body>");
    throw new Error(`Relic request failed for ${context}: ${res.status} ${res.statusText} -> ${body}`);
  }
  const json = await res.json();
  await sleep(RELIC_DELAY_MS);
  return json;
}

async function fetchMatchHistoryByAlias(alias, count) {
  const aliasesParam = encodeURIComponent(JSON.stringify([alias]));
  const url = `${RELIC_BASE}/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=${aliasesParam}&count=${count}`;
  return fetchRelicJson(url, `recent matches by alias ${alias}`);
}

async function fetchMatchHistoryByProfileId(profileId, count) {
  const url = `${RELIC_BASE}/community/leaderboard/getRecentMatchHistoryByProfileId?title=dow1-de&profile_id=${profileId}&count=${count}`;
  return fetchRelicJson(url, `recent matches by profile ${profileId}`);
}

async function claimNextJob() {
  const candidateQuery = await supabase
    .from("crawl_jobs")
    .select("id,payload,attempts,priority,run_after")
    .eq("kind", JOB_KIND)
    .eq("status", "pending")
    .lte("run_after", nowIso())
    .order("priority", { ascending: true })
    .order("run_after", { ascending: true })
    .order("id", { ascending: true })
    .limit(1);

  if (candidateQuery.error) {
    throw new Error(`Failed to select crawl job: ${candidateQuery.error.message}`);
  }

  const [candidate] = candidateQuery.data ?? [];
  if (!candidate) {
    return null;
  }

  const updatedQuery = await supabase
    .from("crawl_jobs")
    .update({
      status: "in_progress",
      attempts: (candidate.attempts ?? 0) + 1,
      updated_at: nowIso()
    })
    .eq("id", candidate.id)
    .eq("status", "pending")
    .select()
    .single();

  if (updatedQuery.error) {
    if (updatedQuery.error.code === "PGRST116") {
      return null;
    }
    throw new Error(`Failed to mark crawl job in progress: ${updatedQuery.error.message}`);
  }

  return updatedQuery.data;
}

async function recordRunStart(jobId, startedAt, alias) {
  const insert = await supabase
    .from("crawl_runs")
    .insert([{
      job_id: jobId,
      started_at: startedAt,
      success: false,
      request_count: 0,
      notes: alias ? `source_alias=${alias}` : null
    }]);

  if (insert.error && insert.error.code !== "23505") {
    throw new Error(`Failed to record crawl run start: ${insert.error.message}`);
  }
}

async function finalizeRun(jobId, startedAt, payload) {
  const update = await supabase
    .from("crawl_runs")
    .update(payload)
    .eq("job_id", jobId)
    .eq("started_at", startedAt);

  if (update.error) {
    throw new Error(`Failed to update crawl run: ${update.error.message}`);
  }
}

async function fetchPlayer(profileId) {
  const query = await supabase
    .from("players")
    .select("profile_id,current_alias,last_seen_at")
    .eq("profile_id", profileId)
    .maybeSingle();

  if (query.error && query.error.code !== "PGRST116") {
    throw new Error(`Failed to load player ${profileId}: ${query.error.message}`);
  }

  return query.data ?? null;
}

async function fetchLatestAlias(profileId) {
  const query = await supabase
    .from("player_alias_history")
    .select("alias")
    .eq("profile_id", profileId)
    .order("last_seen_at", { ascending: false })
    .limit(1);

  if (query.error) {
    throw new Error(`Failed to load alias history for ${profileId}: ${query.error.message}`);
  }

  const [row] = query.data ?? [];
  return typeof row?.alias === "string" ? row.alias : null;
}

function buildAliasMap(payload) {
  const aliasMap = new Map();
  if (!payload || typeof payload !== "object") return aliasMap;
  for (const value of Object.values(payload)) {
    if (!Array.isArray(value)) continue;
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      if (entry.profile_id === undefined && entry.profileId === undefined) continue;
      if (entry.alias === undefined || entry.alias === null) continue;
      const profileId = parseBigIntish(entry.profile_id ?? entry.profileId);
      if (!profileId) continue;
      const alias = typeof entry.alias === "string" ? entry.alias.trim() : "";
      if (!alias) continue;
      aliasMap.set(profileId, alias);
    }
  }
  return aliasMap;
}

function parseMatchPayload(data, sourceAlias) {
  const stats = Array.isArray(data?.matchHistoryStats) ? data.matchHistoryStats : [];
  const aliasMap = buildAliasMap(data);
  const matches = [];
  const participants = [];
  const rawPayloads = [];
  const playerMap = new Map();
  const aliasHistoryMap = new Map();
  const discoveredProfiles = new Set();

  for (const entry of stats) {
    const matchId = parseBigIntish(entry?.id ?? entry?.match_id);
    if (!matchId) continue;
    const matchTypeId = safeNumber(entry?.matchtype_id ?? entry?.matchTypeId);
    const mapName = typeof entry?.mapname === "string" ? entry.mapname : (typeof entry?.map === "string" ? entry.map : null);
    const description = typeof entry?.description === "string" ? entry.description : null;
    const maxPlayers = safeNumber(entry?.maxplayers ?? entry?.maxPlayers);
    const creatorProfileId = parseBigIntish(entry?.creator_profile_id ?? entry?.creatorProfileId);
    const startedAt = secToIso(entry?.startgametime ?? entry?.startGameTime ?? entry?.start_time);
    const completedAt = secToIso(entry?.completiontime ?? entry?.completionTime ?? entry?.completed_time);
    const durationSeconds = safeNumber(entry?.duration ?? (entry?.completiontime && entry?.startgametime ? entry.completiontime - entry.startgametime : null));
    const observerTotal = safeNumber(entry?.observercount ?? entry?.observerCount);
    const optionsBlob = entry?.options ? JSON.stringify(entry.options) : null;
    const slotInfoBlob = entry?.slotinfo ? JSON.stringify(entry.slotinfo) : null;

    const crawledAt = nowIso();

    matches.push({
      match_id: matchId,
      match_type_id: matchTypeId,
      map_name: mapName,
      description,
      max_players: maxPlayers,
      creator_profile_id: creatorProfileId,
      started_at: startedAt,
      completed_at: completedAt,
      duration_seconds: durationSeconds,
      observer_total: observerTotal,
      crawled_at: crawledAt,
      source_alias: sourceAlias ?? null,
      options_blob: optionsBlob,
      slot_info_blob: slotInfoBlob
    });


    const members = Array.isArray(entry?.matchhistorymember) ? entry.matchhistorymember : [];
    rawPayloads.push({ match_id: matchId, payload: members.length ? members : entry });

    for (const member of members) {
      const profileId = parseBigIntish(member?.profile_id ?? member?.profileId);
      if (!profileId) continue;
      discoveredProfiles.add(profileId);

      const alias = aliasMap.get(profileId) ?? (typeof member?.alias === "string" ? member.alias.trim() : null);
      const country = typeof member?.country === "string" ? member.country.trim().toUpperCase() : null;
      const statgroupId = parseBigIntish(member?.statgroup_id ?? member?.statgroupId);
      const teamId = safeNumber(member?.teamid ?? member?.teamId);
      const raceId = safeNumber(member?.race_id ?? member?.raceId);
      const outcomeRaw = member?.outcome ?? member?.result;
      const wins = safeNumber(member?.wins);
      const losses = safeNumber(member?.losses);
      const streak = safeNumber(member?.streak);
      const arbitration = safeNumber(member?.arbitration);
      const reportType = safeNumber(member?.reporttype ?? member?.reportType);
      const oldRating = safeNumber(member?.oldrating ?? member?.oldRating);
      const newRating = safeNumber(member?.newrating ?? member?.newRating);
      const ratingDelta = Number.isFinite(oldRating) && Number.isFinite(newRating) ? newRating - oldRating : null;
      const isComputer = Boolean(member?.iscomputer ?? member?.isComputer ?? member?.is_ai ?? member?.aislot);

      participants.push({
        match_id: matchId,
        profile_id: profileId,
        team_id: teamId,
        race_id: raceId,
        statgroup_id: statgroupId,
        alias_at_match: alias ?? null,
        outcome: determineOutcome(outcomeRaw),
        outcome_raw: safeNumber(outcomeRaw),
        wins,
        losses,
        streak,
        arbitration,
        report_type: reportType,
        old_rating: oldRating,
        new_rating: newRating,
        rating_delta: ratingDelta,
        is_computer: isComputer
      });

      const seenAt = completedAt ?? nowIso();
      const playerEntry = playerMap.get(profileId) ?? { profile_id: profileId };
      if (alias) playerEntry.current_alias = alias;
      if (country && !playerEntry.country) playerEntry.country = country;
      if (statgroupId && !playerEntry.statgroup_id) playerEntry.statgroup_id = statgroupId;
      if (!playerEntry.last_seen_at || playerEntry.last_seen_at < seenAt) playerEntry.last_seen_at = seenAt;
      playerMap.set(profileId, playerEntry);

      if (alias) {
        const key = `${profileId}::${alias}`;
        const aliasRow = aliasHistoryMap.get(key) ?? {
          profile_id: profileId,
          alias,
          first_seen_at: seenAt,
          last_seen_at: seenAt
        };
        if (aliasRow.first_seen_at > seenAt) aliasRow.first_seen_at = seenAt;
        if (aliasRow.last_seen_at < seenAt) aliasRow.last_seen_at = seenAt;
        aliasHistoryMap.set(key, aliasRow);
      }
    }
  }

  return {
    matches,
    participants,
    rawPayloads,
    players: Array.from(playerMap.values()),
    aliasHistory: Array.from(aliasHistoryMap.values()),
    discoveredProfiles: Array.from(discoveredProfiles)
  };
}

async function chunkedUpsert(table, rows, options) {
  if (!rows.length) return;
  for (let idx = 0; idx < rows.length; idx += UPSERT_CHUNK_SIZE) {
    const slice = rows.slice(idx, idx + UPSERT_CHUNK_SIZE);
    const query = await supabase
      .from(table)
      .upsert(slice, {
        ...options,
        returning: "minimal"
      });
    if (query.error) {
      throw new Error(`Failed to upsert into ${table}: ${query.error.message}`);
    }
  }
}

async function enqueueProfiles(profileIds, playerMap) {
  for (const profileId of profileIds) {
    const payload = {
      profile_id: profileId,
      alias: playerMap.get(profileId)?.current_alias ?? null
    };
    const priority = Math.max(JOB_PRIORITY_FLOOR, Math.min(DISCOVERY_PRIORITY, JOB_PRIORITY_CEIL));
    const insert = await supabase
      .from("crawl_jobs")
      .insert([{ kind: JOB_KIND, payload, priority }], { returning: "minimal" });
    if (insert.error && !isDuplicateError(insert.error)) {
      throw new Error(`Failed to enqueue profile ${profileId}: ${insert.error.message}`);
    }
  }
}

async function updateJobStatus(jobId, payload) {
  const update = await supabase
    .from("crawl_jobs")
    .update(payload)
    .eq("id", jobId);
  if (update.error) {
    throw new Error(`Failed to update crawl job ${jobId}: ${update.error.message}`);
  }
}

function computeBackoffMinutes(attempts) {
  const exponent = Math.min(6, Math.max(1, attempts));
  return Math.pow(2, exponent);
}

async function processJob(job) {
  const payload = job.payload ?? {};
  const profileId = parseBigIntish(payload.profile_id ?? payload.profileId);
  if (!profileId) {
    throw new Error(`Job ${job.id} payload missing profile_id`);
  }

  const playerRow = await fetchPlayer(profileId);
  const aliasFromPayload = typeof payload.alias === "string" ? payload.alias.trim() : null;
  const playerAlias = playerRow?.current_alias ? playerRow.current_alias.trim() : null;
  const aliasHistory = await fetchLatestAlias(profileId);
  const alias = aliasFromPayload || playerAlias || aliasHistory || null;

  const cooldownMs = COOLDOWN_MINUTES > 0 ? COOLDOWN_MINUTES * 60 * 1000 : 0;
  if (cooldownMs && playerRow?.last_seen_at) {
    const lastSeenMs = Date.parse(playerRow.last_seen_at);
    if (Number.isFinite(lastSeenMs)) {
      const elapsed = Date.now() - lastSeenMs;
      if (elapsed < cooldownMs) {
        const runAfter = new Date(lastSeenMs + cooldownMs).toISOString();
        await updateJobStatus(job.id, {
          status: "pending",
          run_after: runAfter,
          last_error: null
        });
        return {
          profileId,
          matchesFetched: 0,
          participants: 0,
          reason: "cooldown"
        };
      }
    }
  }

  const runStartedAt = nowIso();
  await recordRunStart(job.id, runStartedAt, alias ?? undefined);
  const baselineRequests = relicRequestCount;

  let matchPayload;
  let matchSource = alias ? `alias:${alias}` : `profile:${profileId}`;
  try {
    if (alias) {
      try {
        matchPayload = await fetchMatchHistoryByAlias(alias, MAX_MATCHES);
        matchSource = `alias:${alias}`;
      } catch (err) {
        console.warn(`Alias fetch failed for ${profileId}/${alias}:`, err.message);
      }
    }

    if (!matchPayload) {
      matchPayload = await fetchMatchHistoryByProfileId(profileId, MAX_MATCHES);
      matchSource = `profile:${profileId}`;
    }
  } catch (err) {
    throw new Error(`Failed to fetch match history for ${profileId}: ${err.message}`);
  }

  const parsed = parseMatchPayload(matchPayload, alias);
  const { matches, participants, players, aliasHistory: aliasRows, discoveredProfiles, rawPayloads } = parsed;
  const playerMap = new Map(players.map(p => [p.profile_id, p]));

  const seenProfiles = new Set(discoveredProfiles);
  seenProfiles.delete(profileId);

  try {
    if (matches.length) {
      await chunkedUpsert("matches", matches, { onConflict: "match_id" });
    }

    if (players.length) {
      await chunkedUpsert("players", players, { onConflict: "profile_id" });
    }

    if (aliasRows.length) {
      await chunkedUpsert("player_alias_history", aliasRows, { onConflict: "profile_id,alias" });
    }

    if (participants.length) {
      await chunkedUpsert("match_participants", participants, { onConflict: "match_id,profile_id" });
    }

    if (rawPayloads.length) {
      await chunkedUpsert("match_players_raw", rawPayloads, { onConflict: "match_id" });
    }

    if (seenProfiles.size) {
      await enqueueProfiles(Array.from(seenProfiles), playerMap);
    }

    const finishedAt = nowIso();
    const jobRequests = relicRequestCount - baselineRequests;
    await finalizeRun(job.id, runStartedAt, {
      finished_at: finishedAt,
      success: true,
      request_count: jobRequests,
      error_message: null,
      notes: `${matches.length} matches, ${participants.length} participants, fetched via ${matchSource}`
    });

    const playerLastSeen = players.find(p => p.profile_id === profileId)?.last_seen_at ?? finishedAt;
    await chunkedUpsert("players", [{ profile_id: profileId, last_seen_at: playerLastSeen }], { onConflict: "profile_id" });

    await updateJobStatus(job.id, {
      status: "done",
      last_error: null,
      updated_at: finishedAt
    });

    return {
      profileId,
      matchesFetched: matches.length,
      participants: participants.length,
      discovered: seenProfiles.size,
      source: matchSource
    };
  } catch (err) {
    const finishedAt = nowIso();
    const jobRequests = relicRequestCount - baselineRequests;
    await finalizeRun(job.id, runStartedAt, {
      finished_at: finishedAt,
      success: false,
      error_message: err.message,
      request_count: jobRequests
    });
    throw err;
  }
}

async function handleJob(job) {
  try {
    const result = await processJob(job);
    if (result.reason === "cooldown") {
      console.log(`Job ${job.id} for ${result.profileId} deferred due to cooldown.`);
      return;
    }
    console.log(`Job ${job.id} processed profile ${result.profileId}: ${result.matchesFetched} matches, ${result.participants} participants, discovered ${result.discovered ?? 0} profiles (${result.source}).`);
  } catch (err) {
    const attempts = job.attempts ?? 0;
    const backoffMinutes = computeBackoffMinutes(attempts);
    const runAfter = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();
    const status = attempts >= JOB_MAX_ATTEMPTS ? "failed" : "pending";
    const updatePayload = {
      status,
      run_after: runAfter,
      last_error: err.message,
      updated_at: nowIso()
    };
    await updateJobStatus(job.id, updatePayload);
    console.error(`Job ${job.id} failed for profile ${parseBigIntish(job?.payload?.profile_id)}: ${err.message}`);
  }
}

async function main() {
  console.log("Starting player match crawler...");
  let idleRounds = 0;
  while (true) {
    const job = await claimNextJob();
    if (!job) {
      idleRounds += 1;
      if (EXIT_ON_IDLE && idleRounds > 1) {
        console.log("No more jobs available; exiting.");
        break;
      }
      await sleep(IDLE_SLEEP_MS);
      continue;
    }

    idleRounds = 0;
    await handleJob(job);
  }
}

main().catch(err => {
  console.error("Crawler failed:", err);
  process.exit(1);
});
