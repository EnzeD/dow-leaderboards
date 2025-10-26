-- Allow winner_team values beyond teams 1 and 2 (support up to 8 teams)
ALTER TABLE public.replay_metadata
  DROP CONSTRAINT IF EXISTS check_winner_team_valid;

ALTER TABLE public.replay_metadata
  ADD CONSTRAINT check_winner_team_valid
  CHECK (
    winner_team IS NULL
    OR (winner_team >= 1 AND winner_team <= 8)
  );

COMMENT ON COLUMN public.replay_metadata.winner_team IS
  'Team that won the match (1-8). NULL indicates unknown or not specified.';
