-- Fix case-sensitive matching for replay players
-- Bug: "lifelit2" was matching "Lifelit2" due to case-insensitive comparison

DROP FUNCTION IF EXISTS match_replay_players_to_database(text);

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

        -- Try exact match first (CASE-SENSITIVE, highest confidence)
        FOR search_result IN
            SELECT psi.profile_id, psi.current_alias
            FROM player_search_index psi
            WHERE psi.current_alias = replay_profile.profile_data->>'alias'  -- CASE-SENSITIVE
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

        -- If no exact match, try fuzzy search (still case-insensitive for fuzzy)
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

-- Update permissions
GRANT EXECUTE ON FUNCTION match_replay_players_to_database TO anon, authenticated;