-- Instant search optimization for 40k players
-- Uses multiple strategies: indexes, full-text search, trigram similarity, and materialized views

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- For trigram similarity search

-- Create optimized indexes for player search
-- These significantly speed up alias lookups

-- 1. B-tree indexes for exact matches (fastest)
CREATE INDEX IF NOT EXISTS idx_players_current_alias_lower
    ON players (lower(current_alias));

CREATE INDEX IF NOT EXISTS idx_player_alias_history_alias_lower
    ON player_alias_history (lower(alias));

-- 2. GIN indexes for pattern matching (LIKE queries)
CREATE INDEX IF NOT EXISTS idx_players_current_alias_gin
    ON players USING gin (lower(current_alias) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_player_alias_history_alias_gin
    ON player_alias_history USING gin (lower(alias) gin_trgm_ops);

-- 3. Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_players_search_combo
    ON players (profile_id, lower(current_alias), last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_player_alias_history_search_combo
    ON player_alias_history (profile_id, lower(alias), last_seen_at DESC);

-- 6. Create materialized view for ultra-fast search
-- This pre-computes all player names with their stats
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
    p.level,
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
    ) as all_aliases
FROM players p
LEFT JOIN aggregated_stats s ON p.profile_id = s.profile_id;

-- Create indexes on the materialized view
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

-- 7. Create fast search function
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

-- 8. Create auto-refresh function for materialized view
CREATE OR REPLACE FUNCTION refresh_player_search_index()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY player_search_index;
END;
$$;

-- 9. Create trigger to track when refresh is needed
CREATE TABLE IF NOT EXISTS search_index_refresh_log (
    id serial PRIMARY KEY,
    refreshed_at timestamptz DEFAULT now(),
    duration_ms integer,
    row_count integer
);

-- 10. Optimized function for autocomplete (even faster, limited fields)
CREATE OR REPLACE FUNCTION autocomplete_players(
    search_query text,
    max_results int DEFAULT 10
)
RETURNS TABLE (
    profile_id bigint,
    alias text,
    rating integer
)
LANGUAGE sql
STABLE PARALLEL SAFE
AS $$
    SELECT
        profile_id,
        current_alias as alias,
        max_rating as rating
    FROM player_search_index
    WHERE lower(current_alias) LIKE lower(search_query) || '%'
    ORDER BY
        CASE WHEN lower(current_alias) = lower(search_query) THEN 0 ELSE 1 END,
        max_rating DESC NULLS LAST
    LIMIT max_results;
$$;

-- 11. Initial refresh of materialized view
REFRESH MATERIALIZED VIEW player_search_index;

-- 12. Grant permissions
GRANT SELECT ON player_search_index TO anon, authenticated;
GRANT EXECUTE ON FUNCTION search_players TO anon, authenticated;
GRANT EXECUTE ON FUNCTION autocomplete_players TO anon, authenticated;

-- 13. Add comment documentation
COMMENT ON MATERIALIZED VIEW player_search_index IS
    'Pre-computed search index for instant player lookups. Refresh periodically via refresh_player_search_index()';

COMMENT ON FUNCTION search_players IS
    'Fast player search with fuzzy matching and relevance scoring. Returns results ordered by relevance and rating.';

COMMENT ON FUNCTION autocomplete_players IS
    'Ultra-fast autocomplete for player names. Returns minimal data for UI responsiveness.';

-- 14. Create scheduled job to refresh search index (if pg_cron is available)
-- This should be run every hour or after significant data updates
DO $$
BEGIN
    -- Check if pg_cron extension exists
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        -- Schedule hourly refresh
        PERFORM cron.schedule(
            'refresh-player-search-index',
            '0 * * * *', -- Every hour
            'SELECT refresh_player_search_index();'
        );
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- pg_cron not available, ignore
        NULL;
END $$;