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

const BATCH_SIZE = Number.parseInt(process.env.XP_REFRESH_BATCH_SIZE ?? "100", 10);
const CONCURRENCY = Number.parseInt(process.env.XP_REFRESH_CONCURRENCY ?? "6", 10);
const MATCH_FETCH_COUNT = Number.parseInt(process.env.XP_REFRESH_MATCH_COUNT ?? "50", 10);
const UPSERT_CHUNK_SIZE = Number.parseInt(process.env.XP_REFRESH_UPSERT_CHUNK ?? "500", 10);
const RELIC_DELAY_MS = Number.parseInt(process.env.XP_REFRESH_RELIC_DELAY_MS ?? "150", 10);
const RELIC_REQUEST_CAP = Number.parseInt(process.env.XP_REFRESH_RELIC_REQUEST_CAP ?? "100000", 10);
const LOG_EVERY = Number.parseInt(process.env.XP_REFRESH_LOG_EVERY ?? "100", 10);

let relicRequestCount = 0;
let totalProcessed = 0;
let totalUpdated = 0;
let totalXpIncreased = 0;
let totalMatchesFetched = 0;
let totalSkippedNoSteam = 0;
let totalFailed = 0;
let totalPlayers = 0;
let newPlayersDiscovered = 0;
let totalMatchesInserted = 0;
let startTimeMs = Date.now();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function nowIso() {
  return new Date().toISOString();
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
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

function determineOutcome(raw) {
  if (raw === 1 || raw === "1") return "win";
  if (raw === 0 || raw === "0") return "loss";
  return "unknown";
}

let knownRaceIds = new Set();
const knownProfileIds = new Set();

async function loadRaceIds() {
  if (knownRaceIds.size) return;
  const { data, error } = await supabase
    .from("races")
    .select("id");
  if (error) {
    console.warn(`Failed to load race ids: ${error.message}`);
    knownRaceIds = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    return;
  }
  knownRaceIds = new Set((data ?? []).map(row => Number(row.id)).filter(Number.isFinite));
}

function sanitizeRaceId(value) {
  const num = safeNumber(value);
  if (!Number.isFinite(num)) return null;
  return knownRaceIds.has(num) ? num : null;
}

async function loadPlayerMetadata() {
  const pageSize = 1000;
  let offset = 0;
  let first = true;

  while (true) {
    const query = supabase
      .from("players")
      .select("profile_id", { count: first ? "exact" : undefined })
      .order("profile_id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`Failed to load player metadata: ${error.message}`);
    }

    if (first && Number.isFinite(count)) {
      totalPlayers = count;
    }

    const rows = data ?? [];
    rows.forEach(row => {
      const id = parseBigIntish(row?.profile_id);
      if (id) knownProfileIds.add(id);
    });

    if (rows.length < pageSize) break;
    offset += rows.length;
    first = false;
  }

  if (!totalPlayers) {
    totalPlayers = knownProfileIds.size;
  }
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
  const res = await fetch(url, { headers: { "User-Agent": "dow1-de-xp-refresh" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "<failed to read body>");
    throw new Error(`Relic request failed for ${context}: ${res.status} ${res.statusText} -> ${body}`);
  }
  const json = await res.json();
  await sleep(RELIC_DELAY_MS);
  return json;
}

async function fetchPersonalStats(steamId) {
  const profileNames = encodeURIComponent(JSON.stringify([`/steam/${steamId}`]));
  const url = `${RELIC_BASE}/community/leaderboard/getPersonalStat?title=dow1-de&profile_names=${profileNames}`;
  return fetchRelicJson(url, `personal stats for steam ${steamId}`);
}

async function fetchMatchHistoryByProfileId(profileId, count) {
  const url = `${RELIC_BASE}/community/leaderboard/getRecentMatchHistoryByProfileId?title=dow1-de&profile_id=${profileId}&count=${count}`;
  return fetchRelicJson(url, `recent matches by profile ${profileId}`);
}

function runWithConcurrency(items, worker, concurrency) {
  const queue = [...items];
  const running = new Set();

  async function runNext() {
    if (!queue.length) return;
    const item = queue.shift();
    const promise = (async () => worker(item))()
      .catch(error => {
        console.error(`Worker failed: ${error.message}`);
      })
      .finally(() => {
        running.delete(promise);
      });
    running.add(promise);

    if (running.size >= concurrency) {
      await Promise.race(running);
    }
  }

  return (async () => {
    while (queue.length) {
      await runNext();
    }
    await Promise.allSettled(Array.from(running));
  })();
}

function buildMatchPayload(data, sourceAlias) {
  const stats = Array.isArray(data?.matchHistoryStats) ? data.matchHistoryStats : [];
  const aliasMap = new Map();
  const matches = [];
  const participants = [];
  const players = new Map();
  const aliasHistory = new Map();
  const discoveredProfiles = new Set();

  const rawAliasCollections = [data?.matchHistoryStats, data?.matchHistoryMembers, data?.recentMatchHistory, data?.recentMatchHistoryMembers];
  for (const collection of rawAliasCollections) {
    if (!Array.isArray(collection)) continue;
    for (const entry of collection) {
      if (!entry || typeof entry !== "object") continue;
      const profileId = parseBigIntish(entry.profile_id ?? entry.profileId);
      if (!profileId) continue;
      const alias = typeof entry.alias === "string" ? entry.alias.trim() : null;
      if (alias) aliasMap.set(profileId, alias);
    }
  }

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
      crawled_at: nowIso(),
      source_alias: sourceAlias ?? null,
      options_blob: optionsBlob,
      slot_info_blob: slotInfoBlob
    });

    const members = Array.isArray(entry?.matchhistorymember) ? entry.matchhistorymember : [];

    for (const member of members) {
      const profileId = parseBigIntish(member?.profile_id ?? member?.profileId);
      if (!profileId) continue;
      discoveredProfiles.add(profileId);

      const alias = aliasMap.get(profileId) ?? (typeof member?.alias === "string" ? member.alias.trim() : null);
      const country = typeof member?.country === "string" ? member.country.trim().toUpperCase() : null;
      const statgroupId = parseBigIntish(member?.statgroup_id ?? member?.statgroupId);
      const teamId = safeNumber(member?.teamid ?? member?.teamId);
      const raceId = sanitizeRaceId(member?.race_id ?? member?.raceId);
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
      const playerEntry = players.get(profileId) ?? { profile_id: profileId };
      if (alias) playerEntry.current_alias = alias;
      if (country && !playerEntry.country) playerEntry.country = country;
      if (statgroupId && !playerEntry.statgroup_id) playerEntry.statgroup_id = statgroupId;
      if (!playerEntry.last_seen_at || playerEntry.last_seen_at < seenAt) playerEntry.last_seen_at = seenAt;
      players.set(profileId, playerEntry);

      if (alias) {
        const key = `${profileId}::${alias}`;
        const existing = aliasHistory.get(key) ?? {
          profile_id: profileId,
          alias,
          first_seen_at: seenAt,
          last_seen_at: seenAt
        };
        if (existing.first_seen_at > seenAt) existing.first_seen_at = seenAt;
        if (existing.last_seen_at < seenAt) existing.last_seen_at = seenAt;
        aliasHistory.set(key, existing);
      }
    }
  }

  return {
    matches,
    participants,
    players: Array.from(players.values()),
    aliasHistory: Array.from(aliasHistory.values()),
    discoveredProfiles: Array.from(discoveredProfiles)
  };
}

function isRetryableUpsertError(error) {
  if (!error) return false;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes("deadlock detected") || message.includes("could not serialize access");
}

async function chunkedUpsert(table, rows, options = {}) {
  if (!rows.length) return;
  for (let offset = 0; offset < rows.length; offset += UPSERT_CHUNK_SIZE) {
    const slice = rows.slice(offset, offset + UPSERT_CHUNK_SIZE);
    let attempt = 0;
    while (attempt < 4) {
      const query = await supabase
        .from(table)
        .upsert(slice, {
          returning: "minimal",
          ...options
        });

      if (!query.error) break;

      if (!isRetryableUpsertError(query.error) || attempt === 3) {
        throw new Error(`Failed to upsert into ${table}: ${query.error.message}`);
      }

      await sleep(RELIC_DELAY_MS * Math.max(1, attempt + 1));
      attempt += 1;
    }
  }
}

async function countNewMatches(rows) {
  if (!rows.length) return 0;
  const uniqueIds = Array.from(
    new Set(
      rows
        .map(row => parseBigIntish(row?.match_id))
        .filter(Boolean)
    )
  );

  if (!uniqueIds.length) return 0;

  const { data, error } = await supabase
    .from("matches")
    .select("match_id")
    .in("match_id", uniqueIds);

  if (error) {
    console.warn(`Failed to check existing match IDs: ${error.message}`);
    return 0;
  }

  const existingIds = new Set((data ?? []).map(row => parseBigIntish(row?.match_id)).filter(Boolean));
  let newCount = 0;
  for (const id of uniqueIds) {
    if (!existingIds.has(id)) newCount += 1;
  }
  return newCount;
}

async function ensureAliasHistory(rows) {
  if (!rows.length) return;
  for (const row of rows) {
    const { error } = await supabase
      .from("player_alias_history")
      .upsert([row], { onConflict: "profile_id,alias", returning: "minimal" });
    if (error && !isDuplicateError(error)) {
      throw new Error(`Failed to upsert alias history for ${row.profile_id}/${row.alias}: ${error.message}`);
    }
  }
}

async function enqueueProfiles(profileIds) {
  if (!profileIds.length) return;
  const payloads = profileIds.map(profileId => ({ kind: "player_matches", payload: { profile_id: profileId }, priority: 12 }));
  const { error } = await supabase.from("crawl_jobs").insert(payloads, { returning: "minimal" });
  if (error && !isDuplicateError(error)) {
    console.warn(`Failed to enqueue ${profileIds.length} profiles:`, error.message);
  }
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "n/a";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hrs > 0) return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  if (mins > 0) return `${mins}:${String(secs).padStart(2, "0")}`;
  return `${Math.max(0, secs)}s`;
}

function getXpRequiredForLevel(level) {
  if (level <= 10) return 10_000;
  if (level <= 20) return 15_000;
  return 25_000;
}

const MAX_LEVEL = 250;
const XP_CAP = 6_000_000;
const XP_LEVELS = (() => {
  const levels = [];
  let xpMin = 1;
  let cumulative = 0;
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const xpRequired = getXpRequiredForLevel(level);
    cumulative += xpRequired;
    const xpMax = cumulative;
    levels.push({ level, xpRequired, cumulativeXp: cumulative, xpMin, xpMax });
    xpMin = xpMax + 1;
  }
  return levels;
})();

const LEVEL_THRESHOLDS = XP_LEVELS.map(l => ({ level: l.level, min: l.xpMin, max: l.xpMax }));

function getLevelFromXP(xp) {
  if (!xp || xp <= 0) return 1;
  if (xp >= XP_CAP) return MAX_LEVEL;
  let left = 0;
  let right = LEVEL_THRESHOLDS.length - 1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const threshold = LEVEL_THRESHOLDS[mid];
    if (xp < threshold.min) {
      right = mid - 1;
      continue;
    }
    if (xp > threshold.max) {
      left = mid + 1;
      continue;
    }
    return threshold.level;
  }
  return 1;
}

async function processPlayer(player) {
  const playerIdStr = parseBigIntish(player.profile_id);
  if (playerIdStr) knownProfileIds.add(playerIdStr);

  if (!player.steam_id64) {
    totalSkippedNoSteam += 1;
    return;
  }

  let personalStats;
  try {
    personalStats = await fetchPersonalStats(player.steam_id64);
  } catch (error) {
    totalFailed += 1;
    console.warn(`Failed to fetch personal stats for ${player.profile_id}: ${error.message}`);
    return;
  }

  const statGroup = Array.isArray(personalStats?.statGroups) ? personalStats.statGroups[0] : undefined;
  const member = Array.isArray(statGroup?.members) ? statGroup.members[0] : undefined;
  const xp = safeNumber(member?.xp);
  const alias = typeof member?.alias === "string" ? member.alias.trim() : null;
  const country = typeof member?.country === "string" ? member.country.trim().toUpperCase() : null;

  if (!Number.isFinite(xp)) {
    return;
  }

  const level = getLevelFromXP(xp);
  const previousXp = Number.isFinite(player.xp) ? player.xp : null;
  const xpIncreased = previousXp === null ? true : xp > previousXp;
  const playerUpdate = {
    profile_id: player.profile_id,
    xp,
    level,
    last_seen_at: nowIso()
  };
  if (alias) playerUpdate.current_alias = alias;
  if (country) playerUpdate.country = country;
  if (statGroup?.id) playerUpdate.statgroup_id = safeNumber(statGroup.id);

  const { error: upsertError } = await supabase
    .from("players")
    .upsert([playerUpdate], { onConflict: "profile_id", returning: "minimal" });

  if (upsertError) {
    totalFailed += 1;
    console.error(`Failed to upsert player ${player.profile_id}:`, upsertError.message);
    return;
  }

  totalUpdated += 1;
  if (xpIncreased) totalXpIncreased += 1;

  if (!xpIncreased) {
    return;
  }

  let matchData;
  try {
    matchData = await fetchMatchHistoryByProfileId(player.profile_id, MATCH_FETCH_COUNT);
  } catch (error) {
    console.warn(`Failed to fetch matches for ${player.profile_id}: ${error.message}`);
    return;
  }

  const parsed = buildMatchPayload(matchData, alias ?? player.current_alias ?? null);

  const candidateIds = parsed.players
    .map(p => parseBigIntish(p.profile_id))
    .filter(Boolean);
  const newIds = candidateIds.filter(id => !knownProfileIds.has(id));

  let newMatchesCount = 0;
  try {
    if (parsed.matches.length) {
      newMatchesCount = await countNewMatches(parsed.matches);
    }
    if (parsed.players.length) {
      await chunkedUpsert("players", parsed.players, { onConflict: "profile_id" });
    }
    await chunkedUpsert("matches", parsed.matches, { onConflict: "match_id" });
    await chunkedUpsert("match_participants", parsed.participants, { onConflict: "match_id,profile_id" });
    await ensureAliasHistory(parsed.aliasHistory);
    await enqueueProfiles(parsed.discoveredProfiles.filter(id => id !== player.profile_id));
  } catch (error) {
    totalFailed += 1;
    console.error(`Failed to persist match data for ${player.profile_id}: ${error.message}`);
    return;
  }

  totalMatchesFetched += parsed.matches.length;
  totalMatchesInserted += newMatchesCount;
  if (newIds.length) {
    newPlayersDiscovered += newIds.length;
    totalPlayers += newIds.length;
    newIds.forEach(id => knownProfileIds.add(id));
  }
}

async function fetchPlayersBatch(offset) {
  const { data, error } = await supabase
    .from("players")
    .select("profile_id, steam_id64, xp, level, current_alias")
    .order("xp", { ascending: false, nullsFirst: false })
    .order("profile_id", { ascending: true })
    .range(offset, offset + BATCH_SIZE - 1);
  if (error) {
    throw new Error(`Failed to fetch players batch: ${error.message}`);
  }
  return data ?? [];
}

async function processBatch(players) {
  await runWithConcurrency(players, processPlayer, CONCURRENCY);
}

async function main() {
  console.log("Starting daily XP refresh crawler...");
  console.log(`Batch size: ${BATCH_SIZE}, concurrency: ${CONCURRENCY}, match fetch count: ${MATCH_FETCH_COUNT}`);
  console.log("Processing players ordered by highest XP first (profile_id breaks ties).");

  await loadRaceIds();
  await loadPlayerMetadata();
  startTimeMs = Date.now();
  console.log(`Tracking ${totalPlayers} existing players before crawl.`);

  let offset = 0;

  while (true) {
    const batch = await fetchPlayersBatch(offset);
    if (!batch.length) break;

    await processBatch(batch);

    totalProcessed += batch.length;
    offset += batch.length;

    if (totalProcessed % LOG_EVERY === 0) {
      const remaining = Math.max(0, totalPlayers - totalProcessed);
      const elapsedSeconds = (Date.now() - startTimeMs) / 1000;
      const speed = elapsedSeconds > 0 ? totalProcessed / elapsedSeconds : 0;
      const etaSeconds = speed > 0 ? remaining / speed : Infinity;
      console.log(
        `Processed ${totalProcessed} players | updated ${totalUpdated} | XP increased ${totalXpIncreased} | matches fetched ${totalMatchesFetched} | skipped (no steam) ${totalSkippedNoSteam} | ` +
        `matches inserted ${totalMatchesInserted} | new players discovered ${newPlayersDiscovered} | remaining ${remaining} | ETA ${formatDuration(etaSeconds)}`
      );
    }
  }

  console.log("XP refresh complete.");
  console.log(`Processed ${totalProcessed} players.`);
  console.log(`Updated ${totalUpdated} players (XP increased for ${totalXpIncreased}).`);
  console.log(`Fetched ${totalMatchesFetched} matches.`);
  console.log(`Inserted ${totalMatchesInserted} matches.`);
  console.log(`Skipped ${totalSkippedNoSteam} players with no steam_id64.`);
  console.log(`Failed operations: ${totalFailed}.`);
  console.log(`Relic requests used: ${relicRequestCount}/${RELIC_REQUEST_CAP}.`);
  const remainingFinal = Math.max(0, totalPlayers - totalProcessed);
  const elapsedTotalSeconds = (Date.now() - startTimeMs) / 1000;
  const avgSpeed = elapsedTotalSeconds > 0 ? totalProcessed / elapsedTotalSeconds : 0;
  console.log(`New players discovered during run: ${newPlayersDiscovered}.`);
  console.log(`Remaining players: ${remainingFinal}.`);
  console.log(`Average processing speed: ${avgSpeed.toFixed(2)} players/sec. Total runtime: ${formatDuration(elapsedTotalSeconds)}.`);
}

main().catch(error => {
  console.error("XP refresh crawler failed:", error);
  process.exit(1);
});
