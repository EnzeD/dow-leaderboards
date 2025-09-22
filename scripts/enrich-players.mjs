#!/usr/bin/env node

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = "https://dow-api.reliclink.com";
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

const PLAYER_LIMIT = Number.parseInt(process.env.ENRICH_PLAYER_LIMIT ?? "400", 10);
const RELIC_DELAY_MS = Number.parseInt(process.env.ENRICH_RELIC_DELAY_MS ?? "300", 10);
const RELIC_REQUEST_CAP = Number.parseInt(process.env.ENRICH_RELIC_REQUEST_CAP ?? "10000", 10);
const CONCURRENCY = Number.parseInt(process.env.ENRICH_CONCURRENCY ?? "4", 10);
const ENABLE_ALIAS_FALLBACK = process.env.ENRICH_ALIAS_FALLBACK !== "false";
const INCLUDE_PERSONAL_STATS = process.env.ENRICH_INCLUDE_PERSONAL_STATS === "true";

let relicRequestCount = 0;

function parseSteamIdFromName(name) {
  if (!name || typeof name !== "string") return undefined;
  const match = name.match(/\/steam\/(\d{17})/);
  return match?.[1];
}

function normalizeCountry(value) {
  if (!value || typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length !== 2) return undefined;
  return trimmed.toUpperCase();
}

function safeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function mergeDetails(target, source) {
  if (!source) return target;
  if (source.alias && !target.alias) target.alias = source.alias;
  if (source.steamId && !target.steamId) target.steamId = source.steamId;
  if (source.country && !target.country) target.country = source.country;
  if (source.level !== undefined && target.level === undefined) target.level = source.level;
  if (source.xp !== undefined && target.xp === undefined) target.xp = source.xp;
  if (source.statgroupId && !target.statgroupId) target.statgroupId = source.statgroupId;
  return target;
}

function gatherProfileDetails(payload, profileId) {
  const idStr = String(profileId);
  const details = {};

  const profiles = Array.isArray(payload?.profiles) ? payload.profiles : [];
  const profileRow = profiles.find(p => String(p?.profile_id ?? "") === idStr);
  if (profileRow) {
    const alias = typeof profileRow.alias === "string" ? profileRow.alias.trim() : undefined;
    if (alias) details.alias = alias;
    details.country = normalizeCountry(profileRow.country);
    const statgroupId = safeNumber(profileRow.personal_statgroup_id);
    if (statgroupId) details.statgroupId = statgroupId;
    const level = safeNumber(profileRow.level);
    if (level !== undefined) details.level = level;
    const xp = safeNumber(profileRow.xp);
    if (xp !== undefined) details.xp = xp;
    const steamId = parseSteamIdFromName(profileRow.name);
    if (steamId) details.steamId = steamId;
  }

  const stats = Array.isArray(payload?.matchHistoryStats) ? payload.matchHistoryStats : [];
  for (const stat of stats) {
    const members = Array.isArray(stat?.matchhistorymember) ? stat.matchhistorymember : [];
    for (const member of members) {
      if (String(member?.profile_id ?? "") !== idStr) continue;
      const statgroupId = safeNumber(member?.statgroup_id ?? member?.statgroupId);
      if (statgroupId && !details.statgroupId) details.statgroupId = statgroupId;
    }
  }

  return details;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchRelicJson(url, context) {
  if (relicRequestCount >= RELIC_REQUEST_CAP) {
    throw new Error(`Relic request cap (${RELIC_REQUEST_CAP}) reached while fetching ${context}`);
  }
  relicRequestCount += 1;
  const res = await fetch(url, { headers: { "User-Agent": "dow1-de-enrichment" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "<failed to read body>");
    throw new Error(`Relic request failed for ${context}: ${res.status} ${res.statusText} -> ${body}`);
  }
  const json = await res.json();
  await sleep(RELIC_DELAY_MS);
  return json;
}

async function fetchMatchHistoryByProfileId(profileId) {
  const url = `${BASE}/community/leaderboard/getRecentMatchHistoryByProfileId?title=dow1-de&profile_id=${profileId}&count=50`;
  return fetchRelicJson(url, `recent matches by profile ${profileId}`);
}

async function fetchMatchHistoryByAlias(alias) {
  const aliasesParam = encodeURIComponent(JSON.stringify([alias]));
  const url = `${BASE}/community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=${aliasesParam}&count=50`;
  return fetchRelicJson(url, `recent matches by alias ${alias}`);
}

async function fetchPersonalStats(steamId) {
  if (!steamId) return { profile: undefined, leaderboardStats: [] };
  const profileNames = encodeURIComponent(JSON.stringify([`/steam/${steamId}`]));
  const url = `${BASE}/community/leaderboard/getPersonalStat?title=dow1-de&profile_names=${profileNames}`;
  try {
    const data = await fetchRelicJson(url, `personal stats for steam ${steamId}`);
    const group = Array.isArray(data?.statGroups) ? data.statGroups[0] : undefined;
    const member = Array.isArray(group?.members) ? group.members[0] : undefined;
    const profile = member ? {
      alias: typeof member.alias === "string" ? member.alias.trim() : undefined,
      country: normalizeCountry(member.country),
      level: safeNumber(member.level),
      xp: safeNumber(member.xp),
      statgroupId: safeNumber(group?.id ?? member?.personal_statgroup_id)
    } : undefined;
    const rawStats = Array.isArray(data?.leaderboardStats) ? data.leaderboardStats : [];
    const leaderboardStats = rawStats
      .map(stat => {
        const leaderboardId = Number(stat?.leaderboard_id ?? stat?.leaderboardId ?? 0);
        if (!Number.isFinite(leaderboardId) || leaderboardId <= 0) return null;
        const lastMatchSeconds = Number(stat?.lastmatchdate ?? stat?.lastMatchDate);
        return {
          leaderboardId,
          rating: safeNumber(stat?.rating) ?? null,
          wins: safeNumber(stat?.wins) ?? null,
          losses: safeNumber(stat?.losses) ?? null,
          streak: safeNumber(stat?.streak) ?? null,
          rank: safeNumber(stat?.rank) ?? null,
          disputes: safeNumber(stat?.disputes) ?? null,
          drops: safeNumber(stat?.drops) ?? null,
          rank_total: safeNumber(stat?.ranktotal ?? stat?.rank_total) ?? null,
          rank_level: safeNumber(stat?.ranklevel ?? stat?.rank_level) ?? null,
          region_rank: safeNumber(stat?.regionrank ?? stat?.region_rank) ?? null,
          region_rank_total: safeNumber(stat?.regionranktotal ?? stat?.region_rank_total) ?? null,
          peak_rank: safeNumber(stat?.highestrank ?? stat?.highest_rank) ?? null,
          peak_rank_level: safeNumber(stat?.highestranklevel ?? stat?.highest_rank_level) ?? null,
          peak_rating: safeNumber(stat?.highestrating ?? stat?.highest_rating) ?? null,
          last_match_at: Number.isFinite(lastMatchSeconds) && lastMatchSeconds > 0 ? new Date(lastMatchSeconds * 1000).toISOString() : null
        };
      })
      .filter(Boolean);
    return { profile, leaderboardStats };
  } catch (err) {
    console.warn(`Failed to fetch personal stats for steam ${steamId}:`, err.message);
    return { profile: undefined, leaderboardStats: [] };
  }
}

async function ensureAliasHistory(records) {
  for (const record of records) {
    const { profile_id, alias, seen_at } = record;
    if (!alias) continue;
    const { data: existing, error } = await supabase
      .from("player_alias_history")
      .select("first_seen_at")
      .eq("profile_id", profile_id)
      .eq("alias", alias)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      throw new Error(`Failed to read alias history for ${profile_id}/${alias}: ${error.message}`);
    }

    const firstSeen = existing?.first_seen_at ?? seen_at;
    const { error: upsertError } = await supabase
      .from("player_alias_history")
      .upsert([
        { profile_id, alias, first_seen_at: firstSeen, last_seen_at: seen_at }
      ], { onConflict: "profile_id,alias", returning: "minimal" });

    if (upsertError) {
      throw new Error(`Failed to upsert alias history for ${profile_id}/${alias}: ${upsertError.message}`);
    }
  }
}

function buildPlayerUpdate(profile, details, seenAtIso) {
  const payload = { profile_id: profile.profile_id, last_seen_at: seenAtIso };

  const steamId = details?.steamId ?? profile.steam_id64;
  if (steamId) payload.steam_id64 = steamId;

  const aliasCandidate = details?.alias ?? profile.current_alias;
  if (aliasCandidate) payload.current_alias = aliasCandidate;

  const country = details?.country;
  if (country) payload.country = country;

  const statgroupId = details?.statgroupId ?? profile.statgroup_id;
  if (statgroupId) payload.statgroup_id = statgroupId;

  const level = details?.level;
  if (Number.isFinite(level)) payload.level = level;

  const xp = details?.xp;
  if (Number.isFinite(xp)) payload.xp = xp;

  return payload;
}

async function enrichPlayer(profile) {
  let details = {};
  if (profile.steam_id64) details.steamId = profile.steam_id64;

  try {
    const byProfile = await fetchMatchHistoryByProfileId(profile.profile_id);
    mergeDetails(details, gatherProfileDetails(byProfile, profile.profile_id));
  } catch (err) {
    console.warn(`Failed to fetch match history by profile ${profile.profile_id}:`, err.message);
  }

  if (ENABLE_ALIAS_FALLBACK && (!details.steamId || details.level === undefined || details.xp === undefined || !details.country) && profile.current_alias) {
    try {
      const byAlias = await fetchMatchHistoryByAlias(profile.current_alias);
      mergeDetails(details, gatherProfileDetails(byAlias, profile.profile_id));
    } catch (err) {
      console.warn(`Failed to fetch match history by alias ${profile.current_alias}:`, err.message);
    }
  }

  if (!details.steamId) {
    console.warn(`Unable to resolve steam id for profile ${profile.profile_id}.`);
  }

  let personalStats;
  if (INCLUDE_PERSONAL_STATS && details.steamId) {
    personalStats = await fetchPersonalStats(details.steamId);
    if (personalStats?.profile) {
      mergeDetails(details, {
        alias: personalStats.profile.alias,
        country: personalStats.profile.country,
        level: personalStats.profile.level,
        xp: personalStats.profile.xp,
        statgroupId: personalStats.profile.statgroupId,
        steamId: details.steamId
      });
    }
  }

  const seenAtIso = new Date().toISOString();
  const playerUpdate = buildPlayerUpdate(profile, details, seenAtIso);
  const leaderboardRows = (INCLUDE_PERSONAL_STATS && personalStats?.leaderboardStats?.length)
    ? personalStats.leaderboardStats.map(stat => ({
      profile_id: profile.profile_id,
      leaderboard_id: stat.leaderboardId,
      rating: stat.rating,
      wins: stat.wins,
      losses: stat.losses,
      streak: stat.streak,
      rank: stat.rank,
      rank_total: stat.rank_total,
      rank_level: stat.rank_level,
      disputes: stat.disputes,
      drops: stat.drops,
      region_rank: stat.region_rank,
      region_rank_total: stat.region_rank_total,
      last_match_at: stat.last_match_at,
      peak_rank: stat.peak_rank,
      peak_rank_level: stat.peak_rank_level,
      peak_rating: stat.peak_rating,
      snapshot_at: seenAtIso
    }))
    : [];
  const alias = playerUpdate.current_alias ?? details.alias ?? profile.current_alias;

  if (!playerUpdate.steam_id64 && playerUpdate.level === undefined && playerUpdate.xp === undefined && !playerUpdate.country && !leaderboardRows.length) {
    console.warn(`Enrichment yielded no new data for profile ${profile.profile_id}; updating timestamps only.`);
  }

  const resolved = Boolean(playerUpdate.steam_id64);

  return { playerUpdate, leaderboardRows, alias, seenAtIso, resolved };
}

async function runWithConcurrency(items, handler, concurrency) {
  if (!items.length) return;
  const size = Math.max(1, Math.min(concurrency, items.length));
  let index = 0;

  async function worker() {
    while (true) {
      let currentIndex;
      if (index >= items.length) break;
      currentIndex = index++;
      const item = items[currentIndex];
      await handler(item);
    }
  }

  await Promise.all(Array.from({ length: size }, worker));
}

async function fetchPlayersNeedingEnrichment(limit) {
  const { data, error } = await supabase
    .from("players")
    .select("profile_id,current_alias,steam_id64,level,xp,statgroup_id")
    .or("steam_id64.is.null,level.is.null,xp.is.null")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to load players needing enrichment: ${error.message}`);
  }
  return data ?? [];
}

async function main() {
  const attempted = new Set();
  let totalPlayerUpserts = 0;
  let totalLeaderboardRows = 0;
  let totalAliasUpdates = 0;
  let batch = 0;

  while (true) {
    const batchCandidates = await fetchPlayersNeedingEnrichment(PLAYER_LIMIT);
    const players = batchCandidates.filter(p => !attempted.has(p.profile_id));

    if (!players.length) {
      if (!batch) {
        console.log("No players require enrichment.");
      } else {
        console.log("No additional players found for enrichment.");
      }
      break;
    }

    batch += 1;
    console.log(`Batch ${batch}: processing ${players.length} players with concurrency ${CONCURRENCY}.`);

    const playerUpdates = [];
    const leaderboardRows = [];
    const aliasRecords = new Map();
    let resolvedCount = 0;

    await runWithConcurrency(players, async (profile) => {
      try {
        const result = await enrichPlayer(profile);
        if (!result) return;
        playerUpdates.push(result.playerUpdate);
        leaderboardRows.push(...result.leaderboardRows);
        if (result.alias) {
          const key = `${profile.profile_id}::${result.alias}`;
          aliasRecords.set(key, { profile_id: profile.profile_id, alias: result.alias, seen_at: result.seenAtIso });
        }
        if (result.resolved) resolvedCount += 1;
      } catch (err) {
        console.error(`Failed to enrich profile ${profile.profile_id}:`, err.message);
      } finally {
        attempted.add(profile.profile_id);
      }
    }, CONCURRENCY);

    if (playerUpdates.length) {
      const { error } = await supabase
        .from("players")
        .upsert(playerUpdates, { onConflict: "profile_id", returning: "minimal" });
      if (error) {
        throw new Error(`Failed to upsert players: ${error.message}`);
      }
      totalPlayerUpserts += playerUpdates.length;
      console.log(`Batch ${batch}: upserted ${playerUpdates.length} players (${resolvedCount} resolved).`);
    }

    if (leaderboardRows.length) {
      const { error } = await supabase
        .from("player_leaderboard_stats")
        .insert(leaderboardRows, { returning: "minimal" });
      if (error) {
        throw new Error(`Failed to insert leaderboard stats rows: ${error.message}`);
      }
      totalLeaderboardRows += leaderboardRows.length;
      console.log(`Batch ${batch}: inserted ${leaderboardRows.length} leaderboard stat rows.`);
    }

    if (aliasRecords.size) {
      await ensureAliasHistory(Array.from(aliasRecords.values()));
      totalAliasUpdates += aliasRecords.size;
      console.log(`Batch ${batch}: updated alias history for ${aliasRecords.size} entries.`);
    }

    if (players.length < PLAYER_LIMIT) {
      // Likely processed the tail; loop once more to confirm.
      continue;
    }
  }

  console.log(`Enrichment complete. Players updated: ${totalPlayerUpserts}. Leaderboard rows inserted: ${totalLeaderboardRows}. Alias history updates: ${totalAliasUpdates}.`);
}

main().catch(err => {
  console.error("Enrichment script failed:", err);
  process.exit(1);
});
