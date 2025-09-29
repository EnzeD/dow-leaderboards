-- Create table to link replay players to database players
-- This allows replay player aliases to be connected to profile_ids for search/filtering

CREATE TABLE public.replay_player_links (
  replay_path text NOT NULL,                    -- References replay_metadata.path
  replay_player_alias text NOT NULL,            -- Original alias from replay
  profile_id bigint NOT NULL,                   -- References players.profile_id
  match_confidence real NOT NULL DEFAULT 1.0,   -- Confidence score (0.0-1.0)
  match_method text NOT NULL DEFAULT 'exact',   -- 'exact', 'fuzzy', 'manual'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Primary key allows multiple players per replay
  PRIMARY KEY (replay_path, replay_player_alias)
);

-- Foreign key constraints
ALTER TABLE public.replay_player_links
  ADD CONSTRAINT fk_replay_player_links_replay_path
  FOREIGN KEY (replay_path) REFERENCES public.replay_metadata(path) ON DELETE CASCADE;

ALTER TABLE public.replay_player_links
  ADD CONSTRAINT fk_replay_player_links_profile_id
  FOREIGN KEY (profile_id) REFERENCES public.players(profile_id) ON DELETE CASCADE;

-- Indexes for fast lookups
CREATE INDEX idx_replay_player_links_profile_id
  ON public.replay_player_links (profile_id);

CREATE INDEX idx_replay_player_links_replay_path
  ON public.replay_player_links (replay_path);

CREATE INDEX idx_replay_player_links_alias_lower
  ON public.replay_player_links (lower(replay_player_alias));

-- Function to match replay players to database players
CREATE OR REPLACE FUNCTION match_replay_players_to_database(
    replay_path_input text
)
RETURNS TABLE (
    alias text,
    profile_id bigint,
    confidence real,
    method text
)
LANGUAGE plpgsql
AS $$
DECLARE
    replay_profile record;
    search_result record;
    exact_match_found boolean;
BEGIN
    -- Get all profiles from the replay
    FOR replay_profile IN
        SELECT jsonb_array_elements(profiles) as profile_data
        FROM replay_metadata
        WHERE path = replay_path_input
        AND profiles IS NOT NULL
    LOOP
        exact_match_found := false;

        -- Try exact match first (highest confidence)
        FOR search_result IN
            SELECT psi.profile_id, psi.current_alias
            FROM player_search_index psi
            WHERE lower(psi.current_alias) = lower(replay_profile.profile_data->>'alias')
            ORDER BY psi.max_rating DESC NULLS LAST
            LIMIT 1
        LOOP
            exact_match_found := true;
            alias := replay_profile.profile_data->>'alias';
            profile_id := search_result.profile_id;
            confidence := 1.0;
            method := 'exact';
            RETURN NEXT;
        END LOOP;

        -- If no exact match, try fuzzy search
        IF NOT exact_match_found THEN
            FOR search_result IN
                SELECT
                    psi.profile_id,
                    psi.current_alias,
                    similarity(psi.name_trgm, replay_profile.profile_data->>'alias') as sim_score
                FROM player_search_index psi
                WHERE similarity(psi.name_trgm, replay_profile.profile_data->>'alias') > 0.7
                ORDER BY sim_score DESC, psi.max_rating DESC NULLS LAST
                LIMIT 1
            LOOP
                alias := replay_profile.profile_data->>'alias';
                profile_id := search_result.profile_id;
                confidence := search_result.sim_score;
                method := 'fuzzy';
                RETURN NEXT;
            END LOOP;
        END IF;
    END LOOP;
END;
$$;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_player_links TO anon, authenticated;
GRANT EXECUTE ON FUNCTION match_replay_players_to_database TO anon, authenticated;

-- Comments for documentation
COMMENT ON TABLE public.replay_player_links IS
    'Links replay player aliases to database player profiles for search integration';

COMMENT ON FUNCTION match_replay_players_to_database IS
    'Matches replay player aliases to database players using existing search infrastructure';