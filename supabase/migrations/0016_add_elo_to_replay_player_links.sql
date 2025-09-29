-- Add ELO rating and rank columns to replay_player_links table
-- These store the player's rating at the time the replay was uploaded

ALTER TABLE public.replay_player_links
  ADD COLUMN IF NOT EXISTS rating INTEGER,
  ADD COLUMN IF NOT EXISTS rank INTEGER,
  ADD COLUMN IF NOT EXISTS leaderboard_id INTEGER;

-- Add foreign key constraint for leaderboard_id
ALTER TABLE public.replay_player_links
  ADD CONSTRAINT fk_replay_player_links_leaderboard_id
  FOREIGN KEY (leaderboard_id) REFERENCES public.leaderboards(id) ON DELETE SET NULL;

-- Add index for performance when querying by leaderboard
CREATE INDEX IF NOT EXISTS idx_replay_player_links_leaderboard_id
  ON public.replay_player_links (leaderboard_id);

-- Comment for documentation
COMMENT ON COLUMN public.replay_player_links.rating IS 'Player ELO rating at time of replay upload';
COMMENT ON COLUMN public.replay_player_links.rank IS 'Player rank at time of replay upload';
COMMENT ON COLUMN public.replay_player_links.leaderboard_id IS 'Leaderboard ID for the faction/game mode combination';