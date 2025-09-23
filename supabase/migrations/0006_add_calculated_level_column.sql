-- Add calculated_level column to players table for correct XP-based levels
-- This stores the actual level based on XP to fix the API bug where all players show as level 1

-- First, add the calculated_level column
ALTER TABLE players
ADD COLUMN IF NOT EXISTS calculated_level INTEGER;

-- Create a trigger function to automatically calculate level when XP changes
CREATE OR REPLACE FUNCTION update_calculated_level()
RETURNS TRIGGER AS $$
BEGIN
    -- Calculate level from XP using our mapping function
    NEW.calculated_level := get_level_from_xp(NEW.xp);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for INSERT and UPDATE
DROP TRIGGER IF EXISTS calculate_player_level_trigger ON players;
CREATE TRIGGER calculate_player_level_trigger
    BEFORE INSERT OR UPDATE OF xp ON players
    FOR EACH ROW
    EXECUTE FUNCTION update_calculated_level();

-- Update all existing players with their correct calculated level
UPDATE players
SET calculated_level = get_level_from_xp(xp)
WHERE calculated_level IS NULL OR calculated_level != get_level_from_xp(xp);

-- Create index for fast queries on calculated_level
CREATE INDEX IF NOT EXISTS idx_players_calculated_level
ON players(calculated_level);

-- Also create a composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_players_calculated_level_rating
ON players(calculated_level DESC, profile_id);

-- Update the player_search_index to use calculated_level
DROP MATERIALIZED VIEW IF EXISTS player_search_index CASCADE;

CREATE MATERIALIZED VIEW player_search_index AS
WITH latest_stats AS (
    -- Get most recent stats for each player/leaderboard combo
    SELECT DISTINCT ON (profile_id, leaderboard_id)
        profile_id,
        leaderboard_id,
        rating,
        wins,
        losses,
        streak,
        rank,
        last_match_at
    FROM player_leaderboard_stats
    ORDER BY profile_id, leaderboard_id, snapshot_at DESC
),
aggregated_stats AS (
    -- Aggregate stats across all leaderboards
    SELECT
        profile_id,
        MAX(rating) as max_rating,
        SUM(wins) as total_wins,
        SUM(losses) as total_losses,
        MIN(rank) FILTER (WHERE rank > 0) as best_rank,
        MAX(last_match_at) as last_active,
        COUNT(DISTINCT leaderboard_id) as leaderboard_count
    FROM latest_stats
    GROUP BY profile_id
),
all_aliases AS (
    -- Union current aliases with historical ones
    SELECT
        p.profile_id,
        p.current_alias as alias,
        p.last_seen_at,
        TRUE as is_current
    FROM players p
    WHERE p.current_alias IS NOT NULL

    UNION ALL

    SELECT
        pah.profile_id,
        pah.alias,
        pah.last_seen_at,
        FALSE as is_current
    FROM player_alias_history pah
)
SELECT
    p.profile_id,
    p.current_alias,
    p.steam_id64,
    p.country,
    -- Use the pre-calculated level
    COALESCE(p.calculated_level, 1) as level,
    p.calculated_level,
    p.last_seen_at,
    COALESCE(s.max_rating, 0) as max_rating,
    COALESCE(s.total_wins, 0) as total_wins,
    COALESCE(s.total_losses, 0) as total_losses,
    COALESCE(s.best_rank, 999999) as best_rank,
    COALESCE(s.last_active, p.last_seen_at) as last_active,
    COALESCE(s.leaderboard_count, 0) as leaderboard_count,
    -- Full-text search vector for name
    to_tsvector('simple', COALESCE(p.current_alias, '')) as name_tsv,
    -- Trigram similarity for fuzzy matching
    COALESCE(p.current_alias, '') as name_trgm,
    -- All known aliases as array for comprehensive search
    ARRAY(
        SELECT DISTINCT alias
        FROM all_aliases aa
        WHERE aa.profile_id = p.profile_id
        ORDER BY alias
    ) as all_aliases,
    -- Include XP for any client-side calculations
    p.xp
FROM players p
LEFT JOIN aggregated_stats s ON p.profile_id = s.profile_id;

-- Recreate indexes
CREATE INDEX idx_search_index_profile_id ON player_search_index (profile_id);
CREATE INDEX idx_search_index_alias_lower ON player_search_index (lower(current_alias));
CREATE INDEX idx_search_index_alias_trgm ON player_search_index USING gin (name_trgm gin_trgm_ops);
CREATE INDEX idx_search_index_tsv ON player_search_index USING gin (name_tsv);
CREATE INDEX idx_search_index_rating_desc ON player_search_index (max_rating DESC NULLS LAST);
CREATE INDEX idx_search_index_last_active_desc ON player_search_index (last_active DESC NULLS LAST);
CREATE INDEX idx_search_index_best_rank ON player_search_index (best_rank);
CREATE INDEX idx_search_index_all_aliases ON player_search_index USING gin (all_aliases);
CREATE INDEX idx_search_index_level ON player_search_index (calculated_level);

-- Refresh the materialized view
REFRESH MATERIALIZED VIEW player_search_index;

-- Grant permissions
GRANT SELECT ON player_search_index TO anon, authenticated;

-- Add helpful comments
COMMENT ON COLUMN players.calculated_level IS
    'Actual player level calculated from XP using correct mapping. Fixes API bug where all players show as level 1.';

COMMENT ON TRIGGER calculate_player_level_trigger ON players IS
    'Automatically updates calculated_level when XP changes.';