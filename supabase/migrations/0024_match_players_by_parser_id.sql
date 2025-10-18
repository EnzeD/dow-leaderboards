-- Ensure replay player matching trusts parser-provided IDs and checks players table

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
    alias_text text;
    id_text text;
    id_value bigint;
    id_match_found boolean;
    exact_match_found boolean;
BEGIN
    FOR replay_profile IN
        SELECT jsonb_array_elements(profiles) AS profile_data
        FROM replay_metadata
        WHERE path = replay_path_input
          AND profiles IS NOT NULL
    LOOP
        alias_text := replay_profile.profile_data->>'alias';
        id_text := replay_profile.profile_data->>'id';
        id_match_found := false;
        exact_match_found := false;

        IF id_text IS NOT NULL AND length(id_text) > 0 THEN
            BEGIN
                id_value := id_text::bigint;

                PERFORM 1
                FROM players p
                WHERE p.profile_id = id_value
                LIMIT 1;

                IF FOUND THEN
                    alias := alias_text;
                    profile_id := id_value;
                    confidence := 1.0;
                    method := 'id';
                    id_match_found := true;
                    RETURN NEXT;
                END IF;
            EXCEPTION WHEN invalid_text_representation THEN
                id_match_found := false;
            WHEN others THEN
                id_match_found := false;
            END;
        END IF;

        IF id_match_found THEN
            CONTINUE;
        END IF;

        FOR search_result IN
            SELECT psi.profile_id, psi.current_alias
            FROM player_search_index psi
            WHERE psi.current_alias = alias_text
            ORDER BY psi.max_rating DESC NULLS LAST
            LIMIT 1
        LOOP
            exact_match_found := true;
            alias := alias_text;
            profile_id := search_result.profile_id;
            confidence := 1.0;
            method := 'exact';
            RETURN NEXT;
        END LOOP;

        IF NOT exact_match_found THEN
            FOR search_result IN
                SELECT
                    psi.profile_id,
                    psi.current_alias,
                    similarity(psi.name_trgm, alias_text) AS sim_score
                FROM player_search_index psi
                WHERE similarity(psi.name_trgm, alias_text) > 0.7
                ORDER BY sim_score DESC, psi.max_rating DESC NULLS LAST
                LIMIT 1
            LOOP
                alias := alias_text;
                profile_id := search_result.profile_id;
                confidence := search_result.sim_score;
                method := 'fuzzy';
                RETURN NEXT;
            END LOOP;
        END IF;
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION match_replay_players_to_database TO anon, authenticated;
