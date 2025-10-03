-- Add auto-incrementing ID column for short URLs
-- This enables URLs like: /replays/epic-match-123 instead of long signed URLs

ALTER TABLE public.replay_metadata
  ADD COLUMN id SERIAL UNIQUE;

-- Create index for fast lookups by ID when routing /replays/[id]
CREATE INDEX idx_replay_metadata_id ON public.replay_metadata(id);

-- Backfill: SERIAL automatically assigns IDs to existing rows (1, 2, 3, ...)
-- No manual action needed - PostgreSQL handles this

-- Add documentation comment
COMMENT ON COLUMN public.replay_metadata.id IS 'Auto-incrementing ID used for short URLs (e.g., /replays/epic-match-123)';
