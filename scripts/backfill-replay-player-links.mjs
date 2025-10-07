import 'dotenv/config';

import { createClient } from '@supabase/supabase-js';
import { parseReplay } from 'dowde-replay-parser';
import { tmpdir } from 'node:os';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const REPLAYS_BUCKET = process.env.SUPABASE_REPLAYS_BUCKET ?? 'replays';
const BATCH_SIZE = Number.parseInt(process.env.REPLAY_BACKFILL_BATCH_SIZE ?? '25', 10);

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

const statsCache = new Map();
const steamIdCache = new Map();
const summary = {
  total: 0,
  metadataUpdated: 0,
  linksWritten: 0,
  unmatched: 0,
  errors: 0
};

function getGameModeFromMapName(mapName) {
  if (!mapName) return '1v1';
  const upper = mapName.toUpperCase();
  if (upper.includes('8P') || upper.includes('(8)')) return '4v4';
  if (upper.includes('6P') || upper.includes('(6)')) return '3v3';
  if (upper.includes('5P') || upper.includes('(5)')) return '3v3';
  if (upper.includes('4P') || upper.includes('(4)')) return '2v2';
  if (upper.includes('3P') || upper.includes('(3)')) return '2v2';
  if (upper.includes('2P') || upper.includes('(2)')) return '1v1';
  return '1v1';
}

function normalizeFaction(faction) {
  if (!faction) return faction;
  return faction === 'Tau Empire' ? 'Tau' : faction;
}

function parseMatchDurationSeconds(label) {
  if (!label || typeof label !== 'string') return null;
  const parts = label.split(':');
  if (parts.length !== 2) return null;
  const [minutes, seconds] = parts.map(Number);
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  return minutes * 60 + seconds;
}

async function getSteamId(profileId) {
  if (steamIdCache.has(profileId)) {
    return steamIdCache.get(profileId);
  }

  const { data, error } = await supabase
    .from('players')
    .select('steam_id64')
    .eq('profile_id', Number(profileId))
    .maybeSingle();

  if (error) {
    console.error(`Failed to fetch steam_id for profile ${profileId}`, error);
    steamIdCache.set(profileId, null);
    return null;
  }

  const steamId = data?.steam_id64 ?? null;
  steamIdCache.set(profileId, steamId);
  return steamId;
}

async function fetchPlayerStats(profileId, factionName, gameMode) {
  if (!factionName) return null;
  const cacheKey = `${profileId}::${factionName}::${gameMode}`;
  if (statsCache.has(cacheKey)) {
    return statsCache.get(cacheKey);
  }

  try {
    const steamId = await getSteamId(profileId);
    if (!steamId) {
      statsCache.set(cacheKey, null);
      return null;
    }

    const profileName = encodeURIComponent(JSON.stringify([`/steam/${steamId}`]));
    const url = `https://dow-api.reliclink.com/community/leaderboard/getPersonalStat?&title=dow1-de&profile_names=${profileName}`;
    const res = await fetch(url, { cache: 'no-store' });

    if (!res.ok) {
      console.warn(`Failed to fetch stats for profile ${profileId} (HTTP ${res.status})`);
      statsCache.set(cacheKey, null);
      return null;
    }

    const data = await res.json();
    const leaderboardStats = Array.isArray(data?.leaderboardStats) ? data.leaderboardStats : [];
    const leaderboardId = getFactionLeaderboardId(factionName, gameMode);
    if (!leaderboardId) {
      statsCache.set(cacheKey, null);
      return null;
    }

    const stats = leaderboardStats.find(entry => Number(entry.leaderboard_id) === leaderboardId);
    if (!stats) {
      statsCache.set(cacheKey, null);
      return null;
    }

    const result = {
      rating: Number(stats.rating ?? 0) || null,
      rank: Number(stats.rank ?? 0) || null,
      leaderboardId
    };

    statsCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error(`Failed to fetch Relic stats for profile ${profileId}`, error);
    statsCache.set(cacheKey, null);
    return null;
  }
}

function getFactionLeaderboardId(factionName, gameMode = '1v1') {
  const factionOffsets = {
    'Chaos': 0,
    'Dark Eldar': 1,
    'Eldar': 2,
    'Imperial Guard': 3,
    'Necrons': 4,
    'Orks': 5,
    'Sisters of Battle': 6,
    'Space Marines': 7,
    'Tau': 8
  };

  const gameModeBase = {
    '1v1': 1,
    '2v2': 10,
    '3v3': 19,
    '4v4': 28
  };

  const offset = factionOffsets[factionName];
  const base = gameModeBase[gameMode];

  if (offset === undefined || base === undefined) {
    return null;
  }

  return base + offset;
}

async function downloadReplayToTemp(pathKey) {
  const { data, error } = await supabase.storage
    .from(REPLAYS_BUCKET)
    .download(pathKey);

  if (error || !data) {
    throw error ?? new Error(`No data returned when downloading ${pathKey}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const filePath = path.join(tmpdir(), `replay-${Date.now()}-${Math.random().toString(16).slice(2)}.rec`);
  await fs.writeFile(filePath, buffer);
  return filePath;
}

async function processReplay(row, index, total) {
  const { path: replayPath } = row;
  summary.total += 1;
  console.log(`[${index}/${total}] Processing ${replayPath}`);

  let tempFilePath;
  let parsed;

  try {
    tempFilePath = await downloadReplayToTemp(replayPath);
    parsed = parseReplay(tempFilePath);
  } catch (error) {
    summary.errors += 1;
    console.error(`Failed to parse replay ${replayPath}`, error);
    if (tempFilePath) {
      await fs.unlink(tempFilePath).catch(() => {});
    }
    return;
  }

  if (tempFilePath) {
    await fs.unlink(tempFilePath).catch(() => {});
  }

  const normalizedProfiles = Array.isArray(parsed?.profiles)
    ? parsed.profiles.map(profile => ({
        alias: profile.alias,
        id: typeof profile.id === 'number' ? profile.id : null,
        playertype: profile.playertype ?? null,
        team: profile.team ?? null,
        faction: normalizeFaction(profile.faction)
      }))
    : [];

  const matchDurationLabel = typeof parsed?.matchduration === 'string' ? parsed.matchduration : null;
  const updatePayload = {
    replay_name: parsed?.replayname ?? null,
    map_name: parsed?.mapname ?? null,
    match_duration_label: matchDurationLabel,
    match_duration_seconds: parseMatchDurationSeconds(matchDurationLabel),
    profiles: normalizedProfiles,
    raw_metadata: parsed ?? null,
    updated_at: new Date().toISOString()
  };

  const { error: updateError } = await supabase
    .from('replay_metadata')
    .update(updatePayload)
    .eq('path', replayPath);

  if (updateError) {
    summary.errors += 1;
    console.error(`Failed to update metadata for ${replayPath}`, updateError);
    return;
  }

  summary.metadataUpdated += 1;

  const { data: matches, error: matchError } = await supabase
    .rpc('match_replay_players_to_database', {
      replay_path_input: replayPath
    });

  if (matchError) {
    summary.errors += 1;
    console.error(`Failed to match players for ${replayPath}`, matchError);
    return;
  }

  if (!Array.isArray(matches) || matches.length === 0) {
    summary.unmatched += 1;
    console.warn(`No matches found for ${replayPath}`);
    await supabase
      .from('replay_player_links')
      .delete()
      .eq('replay_path', replayPath);
    return;
  }

  const gameMode = getGameModeFromMapName(parsed?.mapname);

  const enrichedLinks = [];
  for (const match of matches) {
    const alias = match.alias;
    const profileId = Number(match.profile_id);
    const faction = normalizedProfiles.find(profile => profile.alias === alias)?.faction ?? null;
    const stats = await fetchPlayerStats(profileId, faction, gameMode);

    enrichedLinks.push({
      replay_path: replayPath,
      replay_player_alias: alias,
      profile_id: profileId,
      match_confidence: match.confidence,
      match_method: match.method,
      rating: stats?.rating ?? null,
      rank: stats?.rank ?? null,
      leaderboard_id: stats?.leaderboardId ?? null
    });
  }

  const { error: deleteError } = await supabase
    .from('replay_player_links')
    .delete()
    .eq('replay_path', replayPath);

  if (deleteError) {
    summary.errors += 1;
    console.error(`Failed to clear existing links for ${replayPath}`, deleteError);
    return;
  }

  const { error: insertError } = await supabase
    .from('replay_player_links')
    .insert(enrichedLinks);

  if (insertError) {
    summary.errors += 1;
    console.error(`Failed to insert links for ${replayPath}`, insertError);
    return;
  }

  summary.linksWritten += 1;
}

async function main() {
  const { count } = await supabase
    .from('replay_metadata')
    .select('path', { count: 'exact', head: true });

  const totalReplays = count ?? 0;
  console.log(`Found ${totalReplays} replay metadata rows. Starting backfill...`);

  let processed = 0;
  let from = 0;

  while (true) {
    const to = from + BATCH_SIZE - 1;
    const { data: rows, error } = await supabase
      .from('replay_metadata')
      .select('path')
      .order('created_at', { ascending: true, nullsFirst: false })
      .range(from, to);

    if (error) {
      console.error('Failed to fetch replay metadata batch', error);
      summary.errors += 1;
      break;
    }

    if (!rows || rows.length === 0) {
      break;
    }

    for (let i = 0; i < rows.length; i += 1) {
      processed += 1;
      await processReplay(rows[i], processed, totalReplays);
    }

    if (rows.length < BATCH_SIZE) {
      break;
    }

    from += BATCH_SIZE;
  }

  console.log('Backfill complete.');
  console.table(summary);
}

main().catch(error => {
  console.error('Unexpected error during backfill run', error);
  process.exitCode = 1;
});
