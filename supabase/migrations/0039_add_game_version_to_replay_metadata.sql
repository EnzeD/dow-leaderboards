-- Add game_version column to store parsed replay version metadata
ALTER TABLE public.replay_metadata
ADD COLUMN IF NOT EXISTS game_version text;
