-- Add indexes for fast player search
-- Case-insensitive search on current_alias
CREATE INDEX IF NOT EXISTS players_current_alias_lower_idx
ON players (LOWER(current_alias))
WHERE current_alias IS NOT NULL;

-- GIN index for full-text search on current_alias
CREATE INDEX IF NOT EXISTS players_current_alias_gin_idx
ON players USING GIN (to_tsvector('english', current_alias))
WHERE current_alias IS NOT NULL;

-- Composite index for filtered searches
CREATE INDEX IF NOT EXISTS players_alias_country_idx
ON players (current_alias, country)
WHERE current_alias IS NOT NULL;