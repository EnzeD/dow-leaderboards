#!/usr/bin/env node

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://dow-api.reliclink.com";
const PAGE_SIZE = Number.parseInt(process.env.LEADERBOARD_PAGE_SIZE ?? "100", 10);
const MAX_ROWS = Number.parseInt(process.env.LEADERBOARD_SNAPSHOT_MAX ?? "200", 10);
const SNAPSHOT_SOURCE = process.env.LEADERBOARD_SNAPSHOT_SOURCE ?? "manual-initial-seed";
const CAPTURED_AT = new Date();
const CAPTURED_ON = CAPTURED_AT.toISOString().slice(0, 10);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDisplayName(name) {
  return name
    .split("_")
    .map(part => part.length ? part[0].toUpperCase() + part.slice(1) : part)
    .join(" ");
}

async function fetchJson(url, context) {
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch ${context}: ${response.status} ${response.statusText} -> ${text}`);
  }
  return response.json();
}

async function fetchLeaderboards() {
  const url = `${BASE}/community/leaderboard/GetAvailableLeaderboards?title=dow1-de`;
  const json = await fetchJson(url, "leaderboard metadata");
  const boards = Array.isArray(json?.leaderboards) ? json.leaderboards : [];
  return boards.map(lb => ({
    id: Number(lb?.id),
    name: String(lb?.name ?? ""),
    displayName: formatDisplayName(String(lb?.name ?? ""))
  })).filter(lb => Number.isFinite(lb.id) && lb.name);
}

function normalizeProfileId(value) {
  if (value === null || value === undefined) return null;
  try {
    return String(value);
  }
  catch (err) {
    return null;
  }
}

function normalizeStatgroupId(value, allow) {
  if (!allow) return null;
  const normalized = normalizeProfileId(value);
  return normalized;
}

function computeWinrate(wins, losses) {
  const safeWins = Number.isFinite(wins) ? wins : 0;
  const safeLosses = Number.isFinite(losses) ? losses : 0;
  const total = safeWins + safeLosses;
  if (!total) return null;
  return Number(((safeWins / total) * 100).toFixed(2));
}

function mergePlayerRecord(map, profileId, record) {
  if (!profileId) return;
  const current = map.get(profileId) ?? { profile_id: profileId };
  if (record.current_alias && (!current.current_alias || current.current_alias.length < record.current_alias.length)) {
    current.current_alias = record.current_alias;
  }
  if (record.country && !current.country) {
    current.country = record.country;
  }
  if (record.statgroup_id && !current.statgroup_id) {
    current.statgroup_id = record.statgroup_id;
  }
  map.set(profileId, current);
}

async function fetchLeaderboardSnapshotData(leaderboardId, leaderboardName) {
  const entries = [];
  const players = new Map();
  let start = 1;

  while (start <= MAX_ROWS) {
    const count = Math.min(PAGE_SIZE, MAX_ROWS - start + 1);
    const url = `${BASE}/community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=${leaderboardId}&start=${start}&count=${count}&sortBy=1`;
    const json = await fetchJson(url, `leaderboard ${leaderboardId} page starting ${start}`);

    const rawStats = Array.isArray(json?.leaderboardStats) ? json.leaderboardStats : [];
    if (!rawStats.length) break;
    const rawGroups = new Map();
    const statGroupsArray = Array.isArray(json?.statGroups) ? json.statGroups : [];
    for (const group of statGroupsArray) {
      const id = Number(group?.id);
      if (Number.isFinite(id)) rawGroups.set(id, group);
    }

    let processed = 0;

    for (const stat of rawStats) {
      const statgroupIdRaw = stat?.statgroup_id ?? stat?.statGroupId ?? stat?.statgroup?.id;
      const statgroupId = Number.isFinite(Number(statgroupIdRaw)) ? Number(statgroupIdRaw) : null;
      if (!statgroupId) continue;

      const group = rawGroups.get(statgroupId);
      const members = Array.isArray(group?.members) ? group.members : [];
      const primaryMember = members[0];
      const profileId = normalizeProfileId(primaryMember?.profile_id ?? primaryMember?.profileId);
      if (!profileId) continue;

      const wins = Number.isFinite(stat?.wins) ? stat.wins : Number(stat?.win_count ?? stat?.winCount ?? 0);
      const losses = Number.isFinite(stat?.losses) ? stat.losses : Number(stat?.loss_count ?? stat?.lossCount ?? 0);

      const lastMatchSeconds = Number(stat?.lastmatchdate ?? stat?.lastMatchDate);
      const lastMatchAt = Number.isFinite(lastMatchSeconds) && lastMatchSeconds > 0
        ? new Date(lastMatchSeconds * 1000).toISOString()
        : null;

      entries.push({
        rank: Number(stat?.rank ?? stat?.position ?? 0),
        profile_id: profileId,
        statgroup_id: normalizeStatgroupId(statgroupId, members.length === 1),
        rating: Number.isFinite(stat?.rating) ? stat.rating : Number(stat?.elo ?? stat?.score ?? null),
        wins: Number.isFinite(wins) ? wins : null,
        losses: Number.isFinite(losses) ? losses : null,
        streak: Number.isFinite(stat?.streak) ? stat.streak : null,
        disputes: Number.isFinite(stat?.disputes) ? stat.disputes : null,
        drops: Number.isFinite(stat?.drops) ? stat.drops : null,
        rank_total: Number.isFinite(stat?.rank_total) ? stat.rank_total : Number(stat?.rankTotal ?? null),
        rank_level: Number.isFinite(stat?.rank_level) ? stat.rank_level : Number(stat?.rankLevel ?? null),
        region_rank: Number.isFinite(stat?.region_rank) ? stat.region_rank : Number(stat?.regionRank ?? null),
        region_rank_total: Number.isFinite(stat?.region_rank_total) ? stat.region_rank_total : Number(stat?.regionRankTotal ?? null),
        highest_rank: Number.isFinite(stat?.highest_rank) ? stat.highest_rank : Number(stat?.highestRank ?? null),
        highest_rank_level: Number.isFinite(stat?.highest_rank_level) ? stat.highest_rank_level : Number(stat?.highestRankLevel ?? null),
        highest_rating: Number.isFinite(stat?.highest_rating) ? stat.highest_rating : Number(stat?.highestRating ?? null),
        last_match_at: lastMatchAt,
        winrate: computeWinrate(wins, losses)
      });
      processed += 1;

      for (const member of members) {
        const memberId = normalizeProfileId(member?.profile_id ?? member?.profileId);
        if (!memberId) continue;
        const alias = member?.alias ?? member?.name ?? "";
        const trimmedAlias = typeof alias === "string" ? alias.trim() : "";
        const country = typeof member?.country === "string" && member.country.length === 2
          ? member.country.toUpperCase()
          : undefined;
        mergePlayerRecord(players, memberId, {
          current_alias: trimmedAlias || undefined,
          country,
          statgroup_id: members.length === 1 ? normalizeStatgroupId(statgroupId, true) : null
        });
      }
    }

    if (!processed || processed < count) break;

    start += processed;
    await sleep(120); // be polite to the Relic API
  }

  entries.sort((a, b) => a.rank - b.rank);
  console.log(`Fetched ${entries.length.toString().padStart(3)} rows for leaderboard ${leaderboardId} (${leaderboardName})`);
  return { entries, players };
}

async function upsertLeaderboardsMetadata(leaderboards) {
  if (!leaderboards.length) return;
  const payload = leaderboards.map(lb => ({
    id: lb.id,
    name: lb.name,
    display_name: lb.displayName
  }));
  const { error } = await supabase
    .from("leaderboards")
    .upsert(payload, { onConflict: "id", ignoreDuplicates: false, returning: "minimal" });
  if (error) {
    throw new Error(`Failed to upsert leaderboards metadata: ${error.message}`);
  }
}

async function upsertPlayers(playersMap) {
  if (!playersMap.size) return 0;
  const nowIso = CAPTURED_AT.toISOString();
  const rows = Array.from(playersMap.values()).map(player => ({
    profile_id: player.profile_id,
    current_alias: player.current_alias ?? null,
    country: player.country ?? null,
    statgroup_id: player.statgroup_id ?? null,
    last_seen_at: nowIso
  }));

  let processed = 0;
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("players")
      .upsert(chunk, { onConflict: "profile_id", ignoreDuplicates: false, returning: "minimal" });
    if (error) {
      throw new Error(`Failed to upsert players batch starting at ${i}: ${error.message}`);
    }
    processed += chunk.length;
  }
  return processed;
}

async function upsertSnapshot(leaderboardId, totalPlayers) {
  const payload = [{
    leaderboard_id: leaderboardId,
    captured_on: CAPTURED_ON,
    captured_at: CAPTURED_AT.toISOString(),
    source: SNAPSHOT_SOURCE,
    total_players: totalPlayers
  }];

  const { data, error } = await supabase
    .from("leaderboard_snapshots")
    .upsert(payload, {
      onConflict: "leaderboard_id,captured_on",
      ignoreDuplicates: false
    })
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to upsert snapshot for leaderboard ${leaderboardId}: ${error.message}`);
  }

  if (!data?.id) {
    const lookup = await supabase
      .from("leaderboard_snapshots")
      .select("id")
      .eq("leaderboard_id", leaderboardId)
      .eq("captured_on", CAPTURED_ON)
      .maybeSingle();
    if (lookup.error) {
      throw new Error(`Snapshot inserted but unable to retrieve id for leaderboard ${leaderboardId}: ${lookup.error.message}`);
    }
    return lookup.data?.id;
  }

  return data.id;
}

async function upsertSnapshotEntries(snapshotId, entries) {
  if (!entries.length) return;
  const payload = entries.map(entry => ({
    snapshot_id: snapshotId,
    rank: entry.rank,
    profile_id: entry.profile_id,
    statgroup_id: entry.statgroup_id,
    rating: entry.rating,
    wins: entry.wins,
    losses: entry.losses,
    streak: entry.streak,
    disputes: entry.disputes,
    drops: entry.drops,
    rank_total: entry.rank_total,
    rank_level: entry.rank_level,
    region_rank: entry.region_rank,
    region_rank_total: entry.region_rank_total,
    highest_rank: entry.highest_rank,
    highest_rank_level: entry.highest_rank_level,
    highest_rating: entry.highest_rating,
    winrate: entry.winrate,
    last_match_at: entry.last_match_at
  }));

  const chunkSize = 500;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error } = await supabase
      .from("leaderboard_snapshot_entries")
      .upsert(chunk, {
        onConflict: "snapshot_id,rank",
        ignoreDuplicates: false,
        returning: "minimal"
      });
    if (error) {
      throw new Error(`Failed to upsert snapshot entries batch starting at ${i}: ${error.message}`);
    }
  }
}

async function main() {
  console.log(`Starting leaderboard snapshot at ${CAPTURED_AT.toISOString()} (source=${SNAPSHOT_SOURCE})`);

  const leaderboards = await fetchLeaderboards();
  if (!leaderboards.length) {
    throw new Error("No leaderboards returned by Relic API. Aborting.");
  }

  await upsertLeaderboardsMetadata(leaderboards);

  const aggregatedPlayers = new Map();
  let totalPlayerRowsProcessed = 0;

  for (const leaderboard of leaderboards) {
    const { entries, players } = await fetchLeaderboardSnapshotData(leaderboard.id, leaderboard.name);
    if (!entries.length) {
      console.warn(`No rows found for leaderboard ${leaderboard.id} (${leaderboard.name}). Skipping snapshot insertion.`);
      continue;
    }

    if (players.size) {
      totalPlayerRowsProcessed += await upsertPlayers(players);
    }

    for (const [profileId, record] of players) {
      mergePlayerRecord(aggregatedPlayers, profileId, record);
    }

    const snapshotId = await upsertSnapshot(leaderboard.id, entries.length);
    await upsertSnapshotEntries(snapshotId, entries);
  }

  console.log(`Processed ${aggregatedPlayers.size} unique players (${totalPlayerRowsProcessed} rows written).`);
  console.log("Snapshot capture complete.");
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
