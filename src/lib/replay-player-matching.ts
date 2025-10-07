import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { parseFactionFromName } from '@/lib/relic';

export interface ReplayPlayerMatch {
  alias: string;
  profile_id: string;
  confidence: number;
  method: 'id' | 'exact' | 'fuzzy' | 'manual';
  faction?: string;
  rating?: number;
  rank?: number;
  leaderboard_id?: number;
}

export interface ReplayPlayerLink {
  replay_path: string;
  replay_player_alias: string;
  profile_id: string;
  match_confidence: number;
  match_method: 'id' | 'exact' | 'fuzzy' | 'manual';
  rating?: number;
  rank?: number;
  leaderboard_id?: number;
  created_at: string;
  updated_at: string;
}

export interface EnrichedReplayProfile {
  alias: string;
  faction: string;
  team: number;
  id?: number | null;
  profile_id?: string;
  match_confidence?: number;
  current_alias?: string;
  country?: string;
  level?: number;
  max_rating?: number;
  faction_rating?: number;  // Player's rating in this specific faction
  faction_rank?: number;    // Player's rank in this specific faction
  faction_wins?: number;    // Wins in this faction
  faction_losses?: number;  // Losses in this faction
}

/**
 * Gets game mode from map name (2P = 1v1, 4P = 2v2, 6P = 3v3, 8P = 4v4)
 */
export function getGameModeFromMapName(mapName: string | null | undefined): string {
  if (!mapName) return '1v1';
  const upper = mapName.toUpperCase();
  if (upper.includes('8P') || upper.includes('(8)')) return '4v4';
  if (upper.includes('6P') || upper.includes('(6)')) return '3v3';
  if (upper.includes('5P') || upper.includes('(5)')) return '3v3'; // 5P maps count as 3v3
  if (upper.includes('4P') || upper.includes('(4)')) return '2v2';
  if (upper.includes('3P') || upper.includes('(3)')) return '2v2'; // 3P maps count as 2v2
  if (upper.includes('2P') || upper.includes('(2)')) return '1v1';
  return '1v1'; // Default to 1v1
}

/**
 * Maps faction names and game modes to leaderboard IDs for rating lookups
 *
 * Leaderboard ID structure:
 * 1v1: 1-9 (Chaos to Tau)
 * 2v2: 10-18 (Chaos to Tau)
 * 3v3: 19-27 (Chaos to Tau)
 * 4v4: 28-36 (Chaos to Tau)
 */
function getFactionLeaderboardId(factionName: string, gameMode: string = '1v1'): number | null {
  const factionOffsets: Record<string, number> = {
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

  const gameModeBase: Record<string, number> = {
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

/**
 * Matches replay player aliases to database players using the existing search infrastructure
 */
export async function matchReplayPlayersToDatabase(replayPath: string): Promise<ReplayPlayerMatch[]> {
  try {
    const { data, error } = await supabase.rpc('match_replay_players_to_database', {
      replay_path_input: replayPath
    });

    if (error) {
      console.error('Error matching replay players:', error);
      return [];
    }

    return (data || []).map((match: any) => ({
      alias: match.alias,
      profile_id: match.profile_id.toString(),
      confidence: match.confidence,
      method: match.method
    }));
  } catch (error) {
    console.error('Failed to match replay players:', error);
    return [];
  }
}

/**
 * Saves player matches to the database
 */
export async function saveReplayPlayerLinks(
  replayPath: string,
  matches: ReplayPlayerMatch[],
  client: SupabaseClient<any, any, any> = supabase
): Promise<boolean> {
  try {
    const db = client ?? supabase;
    // First, delete existing links for this replay
    await db
      .from('replay_player_links')
      .delete()
      .eq('replay_path', replayPath);

    // Insert new links
    if (matches.length > 0) {
      const links = matches.map(match => ({
        replay_path: replayPath,
        replay_player_alias: match.alias,
        profile_id: parseInt(match.profile_id),
        match_confidence: match.confidence,
        match_method: match.method,
        rating: match.rating || null,
        rank: match.rank || null,
        leaderboard_id: match.leaderboard_id || null
      }));

      const { error } = await db
        .from('replay_player_links')
        .insert(links);

      if (error) {
        console.error('Error saving replay player links:', error);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to save replay player links:', error);
    return false;
  }
}

/**
 * Gets existing player links for a replay
 */
export async function getReplayPlayerLinks(
  replayPath: string,
  client: SupabaseClient<any, any, any> = supabase
): Promise<ReplayPlayerLink[]> {
  try {
    const db = client ?? supabase;
    const { data, error } = await db
      .from('replay_player_links')
      .select('*')
      .eq('replay_path', replayPath);

    if (error) {
      console.error('Error fetching replay player links:', error);
      return [];
    }

    return data || [];
  } catch (error) {
    console.error('Failed to fetch replay player links:', error);
    return [];
  }
}

/**
 * Enriches replay profiles with linked database player information
 */
export async function enrichReplayProfiles(
  replayPath: string,
  profiles: Array<{ alias: string; faction: string; team: number }>,
  mapName?: string | null,
  client?: SupabaseClient<any, any, any>
): Promise<EnrichedReplayProfile[]> {
  try {
    const db = client ?? supabase;
    // Get existing links
    const links = await getReplayPlayerLinks(replayPath, db);
    const linkMap = new Map(links.map(link => [link.replay_player_alias, link]));

    // If no links exist, try to create them
    if (links.length === 0) {
      const matches = await matchReplayPlayersToDatabase(replayPath);
      if (matches.length > 0) {
        await saveReplayPlayerLinks(replayPath, matches, db);
        // Update linkMap with new matches
        matches.forEach(match => {
          linkMap.set(match.alias, {
            replay_path: replayPath,
            replay_player_alias: match.alias,
            profile_id: match.profile_id,
            match_confidence: match.confidence,
            match_method: match.method,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        });
      }
    }

    // Get player details for linked profiles
    const profileIds = Array.from(linkMap.values()).map(link => parseInt(link.profile_id));
    let playerDetails = new Map();

    if (profileIds.length > 0) {
      // Get basic player details
      const { data: playerData } = await supabase
        .from('player_search_index')
        .select('profile_id, current_alias, country, level, max_rating')
        .in('profile_id', profileIds);

      if (playerData) {
        playerDetails = new Map(playerData.map(player => [player.profile_id, player]));
      }
    }

    // Enrich profiles with linked data
    return profiles.map(profile => {
      const link = linkMap.get(profile.alias);
      const enriched: EnrichedReplayProfile = {
        ...profile
      };

      if (link) {
        const playerDetail = playerDetails.get(parseInt(link.profile_id));
        enriched.profile_id = link.profile_id;
        enriched.match_confidence = link.match_confidence;

        if (playerDetail) {
          enriched.current_alias = playerDetail.current_alias;
          enriched.country = playerDetail.country;
          enriched.level = playerDetail.level;
          enriched.max_rating = playerDetail.max_rating;
        }

        // Use the saved ELO data from replay_player_links
        if (link.rating !== undefined && link.rating !== null) {
          enriched.faction_rating = link.rating;
        }
        if (link.rank !== undefined && link.rank !== null) {
          enriched.faction_rank = link.rank;
        }
      }

      return enriched;
    });
  } catch (error) {
    console.error('Failed to enrich replay profiles:', error);
    // Return original profiles without enrichment
    return profiles.map(profile => ({ ...profile }));
  }
}

/**
 * Fetches player stats from Relic API for a given profile
 */
export async function fetchPlayerStatsFromRelic(
  profileId: string,
  factionName: string,
  gameMode: string
): Promise<{ rating?: number; rank?: number; leaderboardId?: number } | null> {
  try {
    // First get the player's steam ID from database
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select('steam_id64')
      .eq('profile_id', parseInt(profileId))
      .maybeSingle();

    if (playerError || !playerData?.steam_id64) {
      console.log(`No steam ID found for profile ${profileId}`);
      return null;
    }

    // Fetch personal stats from Relic API
    const profileName = encodeURIComponent(JSON.stringify([`/steam/${playerData.steam_id64}`]));
    const url = `https://dow-api.reliclink.com/community/leaderboard/getPersonalStat?&title=dow1-de&profile_names=${profileName}`;
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      console.error('Failed to fetch personal stats from Relic:', res.status);
      return null;
    }

    const data: any = await res.json();
    const lbStatsRaw: any[] = Array.isArray(data?.leaderboardStats) ? data.leaderboardStats : [];

    // Get the correct leaderboard ID for this faction/mode combination
    const leaderboardId = getFactionLeaderboardId(factionName, gameMode);
    if (!leaderboardId) {
      console.log(`Could not determine leaderboard ID for ${factionName} ${gameMode}`);
      return null;
    }

    // Find the stats for this specific leaderboard
    const stats = lbStatsRaw.find(s => Number(s.leaderboard_id) === leaderboardId);
    if (!stats) {
      console.log(`No stats found for leaderboard ${leaderboardId} (${factionName} ${gameMode})`);
      return null;
    }

    return {
      rating: Number(stats.rating ?? 0) || undefined,
      rank: Number(stats.rank ?? -1) || undefined,
      leaderboardId
    };
  } catch (error) {
    console.error('Failed to fetch player stats from Relic:', error);
    return null;
  }
}

/**
 * Manual linking function for admin/user corrections
 */
export async function manualLinkReplayPlayer(
  replayPath: string,
  replayAlias: string,
  profileId: string
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('replay_player_links')
      .upsert({
        replay_path: replayPath,
        replay_player_alias: replayAlias,
        profile_id: parseInt(profileId),
        match_confidence: 1.0,
        match_method: 'manual',
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error manually linking replay player:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to manually link replay player:', error);
    return false;
  }
}
