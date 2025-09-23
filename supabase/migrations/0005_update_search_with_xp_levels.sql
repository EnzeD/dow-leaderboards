-- Update the search index to use correct XP-based levels
-- This migration must run AFTER 0004_xp_levels_mapping.sql

-- First, recreate the function with proper plpgsql to avoid inlining issues
CREATE OR REPLACE FUNCTION get_level_from_xp(player_xp integer)
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    IF player_xp IS NULL OR player_xp <= 0 THEN
        RETURN 1;
    END IF;

    IF player_xp > 50000000 THEN
        RETURN 250;
    END IF;

    RETURN COALESCE(
        (SELECT level
         FROM xp_levels
         WHERE player_xp >= xp_min
           AND player_xp <= xp_max
         LIMIT 1),
        1
    );
END;
$$;

-- Drop the existing materialized view
DROP MATERIALIZED VIEW IF EXISTS player_search_index CASCADE;

-- Recreate with correct level calculation
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
    -- Use the XP-based level calculation
    COALESCE(get_level_from_xp(p.xp), p.level, 1) as level,
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
    -- Add XP for client-side level calculation if needed
    p.xp
FROM players p
LEFT JOIN aggregated_stats s ON p.profile_id = s.profile_id;

-- Recreate all indexes
CREATE INDEX idx_search_index_profile_id
    ON player_search_index (profile_id);

CREATE INDEX idx_search_index_alias_lower
    ON player_search_index (lower(current_alias));

CREATE INDEX idx_search_index_alias_trgm
    ON player_search_index USING gin (name_trgm gin_trgm_ops);

CREATE INDEX idx_search_index_tsv
    ON player_search_index USING gin (name_tsv);

CREATE INDEX idx_search_index_rating_desc
    ON player_search_index (max_rating DESC NULLS LAST);

CREATE INDEX idx_search_index_last_active_desc
    ON player_search_index (last_active DESC NULLS LAST);

CREATE INDEX idx_search_index_best_rank
    ON player_search_index (best_rank);

-- GIN index for array search on all aliases
CREATE INDEX idx_search_index_all_aliases
    ON player_search_index USING gin (all_aliases);

-- Add index on correct level
CREATE INDEX idx_search_index_level
    ON player_search_index (level);

-- Initial refresh
REFRESH MATERIALIZED VIEW player_search_index;

-- Grant permissions
GRANT SELECT ON player_search_index TO anon, authenticated;

-- Update the search function to also return XP for client-side calculation
CREATE OR REPLACE FUNCTION search_players(
    search_query text,
    search_limit int DEFAULT 20,
    search_offset int DEFAULT 0
)
RETURNS TABLE (
    profile_id bigint,
    current_alias text,
    steam_id64 text,
    country text,
    level integer,
    xp integer,
    max_rating integer,
    total_wins integer,
    total_losses integer,
    best_rank integer,
    last_active timestamptz,
    relevance real
)
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_query text;
    fuzzy_threshold real := 0.3;
BEGIN
    -- Normalize search query
    normalized_query := lower(trim(search_query));

    -- Return empty if query is too short
    IF length(normalized_query) < 1 THEN
        RETURN;
    END IF;

    RETURN QUERY
    WITH search_results AS (
        SELECT
            psi.profile_id,
            psi.current_alias,
            psi.steam_id64,
            psi.country,
            psi.level,
            psi.xp,
            psi.max_rating,
            psi.total_wins,
            psi.total_losses,
            psi.best_rank,
            psi.last_active,
            -- Calculate relevance score
            CASE
                -- Exact match gets highest score
                WHEN lower(psi.current_alias) = normalized_query THEN 1.0
                -- Starts with query
                WHEN lower(psi.current_alias) LIKE normalized_query || '%' THEN 0.9
                -- Contains query
                WHEN lower(psi.current_alias) LIKE '%' || normalized_query || '%' THEN 0.8
                -- Fuzzy match using trigram similarity
                ELSE similarity(psi.name_trgm, search_query)
            END as relevance_score
        FROM player_search_index psi
        WHERE
            -- Exact or prefix match
            lower(psi.current_alias) LIKE normalized_query || '%'
            -- Or contains match
            OR lower(psi.current_alias) LIKE '%' || normalized_query || '%'
            -- Or fuzzy match above threshold
            OR similarity(psi.name_trgm, search_query) > fuzzy_threshold
            -- Or matches any historical alias
            OR normalized_query = ANY(
                SELECT lower(unnest(psi.all_aliases))
            )
    )
    SELECT
        sr.profile_id,
        sr.current_alias,
        sr.steam_id64,
        sr.country,
        sr.level,
        sr.xp,
        sr.max_rating,
        sr.total_wins,
        sr.total_losses,
        sr.best_rank,
        sr.last_active,
        sr.relevance_score
    FROM search_results sr
    WHERE sr.relevance_score > 0
    ORDER BY
        sr.relevance_score DESC,
        sr.max_rating DESC NULLS LAST,
        sr.last_active DESC NULLS LAST
    LIMIT search_limit
    OFFSET search_offset;
END;
$$;

COMMENT ON MATERIALIZED VIEW player_search_index IS
    'Search index with XP-based level calculation. Refresh via refresh_player_search_index()';