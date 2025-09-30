-- Add winner_team column to replay_metadata table
-- Nullable to support existing replays without winner data

ALTER TABLE public.replay_metadata
  ADD COLUMN winner_team integer;

-- Add check constraint to ensure winner_team is either 1, 2, or null
ALTER TABLE public.replay_metadata
  ADD CONSTRAINT check_winner_team_valid
  CHECK (winner_team IS NULL OR winner_team IN (1, 2));

-- Add index for filtering by winner_team
CREATE INDEX idx_replay_metadata_winner_team
  ON public.replay_metadata (winner_team);

COMMENT ON COLUMN public.replay_metadata.winner_team IS
  'Team that won the match (1 or 2). NULL indicates unknown or not specified.';