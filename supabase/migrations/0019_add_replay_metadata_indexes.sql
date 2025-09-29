-- Add indexes for fast replay listing queries
-- This query is slow: SELECT * FROM replay_metadata WHERE status='published' ORDER BY updated_at DESC

-- Composite index for status + updated_at (most common query)
create index if not exists idx_replay_metadata_status_updated_at
  on public.replay_metadata(status, updated_at desc);

-- Index on path for fast lookups
create index if not exists idx_replay_metadata_path
  on public.replay_metadata(path);