-- Optimization indexes for player enrichment
-- These indexes speed up the enrichment script queries

-- Index for the enrichment script's main query that orders by updated_at
CREATE INDEX IF NOT EXISTS players_updated_at_idx
ON players (updated_at ASC)
WHERE steam_id64 IS NULL OR level IS NULL OR xp IS NULL;

-- Composite index for enrichment filtering
CREATE INDEX IF NOT EXISTS players_enrichment_status_idx
ON players (updated_at ASC, steam_id64, level, xp)
WHERE steam_id64 IS NULL OR level IS NULL OR xp IS NULL;