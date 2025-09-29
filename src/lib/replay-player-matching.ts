import { supabase } from '@/lib/supabase';
import { parseFactionFromName } from '@/lib/relic';

export interface ReplayPlayerMatch {
  alias: string;
  profile_id: string;
  confidence: number;
  method: 'exact' | 'fuzzy' | 'manual';
}

export interface ReplayPlayerLink {
  replay_path: string;
  replay_player_alias: string;
  profile_id: string;
  match_confidence: number;
  match_method: string;
  created_at: string;
  updated_at: string;
}

export interface EnrichedReplayProfile {
  alias: string;
  faction: string;
  team: number;
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
 * Maps faction names to 1v1 leaderboard IDs for rating lookups
 */
function getFactionLeaderboardId(factionName: string): number | null {
  const factionToLeaderboardMap: Record<string, number> = {
    'Chaos': 1,
    'Dark Eldar': 2,
    'Eldar': 3,
    'Imperial Guard': 4,
    'Necrons': 5,
    'Orks': 6,
    'Sisters of Battle': 7,
    'Space Marines': 8,
    'Tau': 9
  };

  return factionToLeaderboardMap[factionName] || null;
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
export async function saveReplayPlayerLinks(replayPath: string, matches: ReplayPlayerMatch[]): Promise<boolean> {
  try {
    // First, delete existing links for this replay
    await supabase
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
        match_method: match.method
      }));

      const { error } = await supabase
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
export async function getReplayPlayerLinks(replayPath: string): Promise<ReplayPlayerLink[]> {
  try {
    const { data, error } = await supabase
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
  profiles: Array<{ alias: string; faction: string; team: number }>
): Promise<EnrichedReplayProfile[]> {
  try {
    // Get existing links
    const links = await getReplayPlayerLinks(replayPath);
    const linkMap = new Map(links.map(link => [link.replay_player_alias, link]));

    // If no links exist, try to create them
    if (links.length === 0) {
      const matches = await matchReplayPlayersToDatabase(replayPath);
      if (matches.length > 0) {
        await saveReplayPlayerLinks(replayPath, matches);
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
    let factionStats = new Map();

    if (profileIds.length > 0) {
      // Get basic player details
      const { data: playerData } = await supabase
        .from('player_search_index')
        .select('profile_id, current_alias, country, level, max_rating')
        .in('profile_id', profileIds);

      if (playerData) {
        playerDetails = new Map(playerData.map(player => [player.profile_id, player]));
      }

      // Get faction-specific stats for each player
      const factionSet = new Set(profiles.map(p => p.faction));
      const uniqueFactions = Array.from(factionSet);
      const leaderboardIds = uniqueFactions
        .map(faction => getFactionLeaderboardId(faction))
        .filter(id => id !== null) as number[];

      if (leaderboardIds.length > 0) {
        const { data: statsData } = await supabase
          .from('player_leaderboard_stats')
          .select('profile_id, leaderboard_id, rating, rank, wins, losses')
          .in('profile_id', profileIds)
          .in('leaderboard_id', leaderboardIds)
          .order('snapshot_at', { ascending: false });

        if (statsData) {
          // Group stats by profile_id and leaderboard_id (latest snapshot only)
          const statsMap = new Map();
          statsData.forEach(stat => {
            const key = `${stat.profile_id}-${stat.leaderboard_id}`;
            if (!statsMap.has(key)) {
              statsMap.set(key, stat);
            }
          });
          factionStats = statsMap;
        }
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

        // Add faction-specific stats
        const leaderboardId = getFactionLeaderboardId(profile.faction);
        if (leaderboardId) {
          const factionStat = factionStats.get(`${link.profile_id}-${leaderboardId}`);
          if (factionStat) {
            enriched.faction_rating = factionStat.rating;
            enriched.faction_rank = factionStat.rank;
            enriched.faction_wins = factionStat.wins;
            enriched.faction_losses = factionStat.losses;
          }
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