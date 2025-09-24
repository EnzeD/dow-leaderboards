-- Remove legacy XP-level infrastructure now that levels are computed in application code

-- 1. Drop indexes that depend on calculated_level or the materialized view
DROP INDEX IF EXISTS idx_players_calculated_level;
DROP INDEX IF EXISTS idx_players_calculated_level_rating;
DROP INDEX IF EXISTS idx_search_index_profile_id;
DROP INDEX IF EXISTS idx_search_index_alias_lower;
DROP INDEX IF EXISTS idx_search_index_alias_trgm;
DROP INDEX IF EXISTS idx_search_index_tsv;
DROP INDEX IF EXISTS idx_search_index_rating_desc;
DROP INDEX IF EXISTS idx_search_index_last_active_desc;
DROP INDEX IF EXISTS idx_search_index_best_rank;
DROP INDEX IF EXISTS idx_search_index_all_aliases;
DROP INDEX IF EXISTS idx_search_index_level;

-- 2. Drop trigger and trigger function that maintained calculated_level
DROP TRIGGER IF EXISTS calculate_player_level_trigger ON players;
DROP FUNCTION IF EXISTS update_calculated_level();

-- 3. Remove calculated_level column from players
ALTER TABLE players
    DROP COLUMN IF EXISTS calculated_level;

-- 4. Drop legacy helper functions and xp_levels lookup table
DROP FUNCTION IF EXISTS get_level_details_from_xp(integer);
DROP FUNCTION IF EXISTS get_level_from_xp(integer);
DROP TABLE IF EXISTS xp_levels;

-- 5. Recreate player_search_index materialized view without calculated_level dependencies
DROP MATERIALIZED VIEW IF EXISTS player_search_index;

CREATE MATERIALIZED VIEW player_search_index AS
WITH latest_stats AS (
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
    SELECT
        profile_id,
        MAX(rating) AS max_rating,
        SUM(wins) AS total_wins,
        SUM(losses) AS total_losses,
        MIN(rank) FILTER (WHERE rank > 0) AS best_rank,
        MAX(last_match_at) AS last_active,
        COUNT(DISTINCT leaderboard_id) AS leaderboard_count
    FROM latest_stats
    GROUP BY profile_id
),
all_aliases AS (
    SELECT
        p.profile_id,
        p.current_alias AS alias,
        p.last_seen_at,
        TRUE AS is_current
    FROM players p
    WHERE p.current_alias IS NOT NULL

    UNION ALL

    SELECT
        pah.profile_id,
        pah.alias,
        pah.last_seen_at,
        FALSE AS is_current
    FROM player_alias_history pah
)
SELECT
    p.profile_id,
    p.current_alias,
    p.steam_id64,
    p.country,
    -- Expose a level column derived from XP using the simplified curve
    CASE
        WHEN p.xp IS NULL OR p.xp <= 0 THEN 1
        WHEN p.xp <= 100000 THEN ((p.xp - 1) / 10000) + 1
        WHEN p.xp <= 250000 THEN 10 + ((p.xp - 100001) / 15000) + 1
        ELSE LEAST(250, 20 + ((LEAST(p.xp, 6000000) - 250001) / 25000) + 1)
    END AS level,
    p.last_seen_at,
    COALESCE(s.max_rating, 0) AS max_rating,
    COALESCE(s.total_wins, 0) AS total_wins,
    COALESCE(s.total_losses, 0) AS total_losses,
    COALESCE(s.best_rank, 999999) AS best_rank,
    COALESCE(s.last_active, p.last_seen_at) AS last_active,
    COALESCE(s.leaderboard_count, 0) AS leaderboard_count,
    to_tsvector('simple', COALESCE(p.current_alias, '')) AS name_tsv,
    COALESCE(p.current_alias, '') AS name_trgm,
    ARRAY(
        SELECT DISTINCT alias
        FROM all_aliases aa
        WHERE aa.profile_id = p.profile_id
        ORDER BY alias
    ) AS all_aliases,
    p.xp
FROM players p
LEFT JOIN aggregated_stats s ON p.profile_id = s.profile_id;

-- 6. Recreate indexes for the refreshed materialized view (excluding level-specific ones)
CREATE INDEX idx_search_index_profile_id ON player_search_index (profile_id);
CREATE INDEX idx_search_index_alias_lower ON player_search_index (lower(current_alias));
CREATE INDEX idx_search_index_alias_trgm ON player_search_index USING gin (name_trgm gin_trgm_ops);
CREATE INDEX idx_search_index_tsv ON player_search_index USING gin (name_tsv);
CREATE INDEX idx_search_index_rating_desc ON player_search_index (max_rating DESC NULLS LAST);
CREATE INDEX idx_search_index_last_active_desc ON player_search_index (last_active DESC NULLS LAST);
CREATE INDEX idx_search_index_best_rank ON player_search_index (best_rank);
CREATE INDEX idx_search_index_all_aliases ON player_search_index USING gin (all_aliases);

-- 7. Refresh and grant access so downstream jobs keep working
REFRESH MATERIALIZED VIEW player_search_index;
GRANT SELECT ON player_search_index TO anon, authenticated;
