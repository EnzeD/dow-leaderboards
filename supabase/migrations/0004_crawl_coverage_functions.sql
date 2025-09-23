-- Functions to efficiently calculate crawl coverage metrics

-- Function to get unique participant coverage stats
CREATE OR REPLACE FUNCTION get_unique_participant_count()
RETURNS TABLE(
  total_participants bigint,
  participants_in_players_db bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH unique_participants AS (
    SELECT DISTINCT profile_id
    FROM match_participants
  ),
  participants_with_player_info AS (
    SELECT
      up.profile_id,
      CASE WHEN p.profile_id IS NOT NULL THEN 1 ELSE 0 END as in_players_db
    FROM unique_participants up
    LEFT JOIN players p ON up.profile_id = p.profile_id
  )
  SELECT
    COUNT(*)::bigint as total_participants,
    SUM(in_players_db)::bigint as participants_in_players_db
  FROM participants_with_player_info;
END;
$$ LANGUAGE plpgsql;

-- Function to get crawling progress stats
CREATE OR REPLACE FUNCTION get_crawling_progress()
RETURNS TABLE(
  total_players bigint,
  players_with_matches bigint,
  players_never_crawled bigint,
  crawling_completion_percent numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH player_crawl_status AS (
    SELECT
      p.profile_id,
      CASE WHEN p.last_seen_at IS NOT NULL THEN 1 ELSE 0 END as has_been_crawled
    FROM players p
  )
  SELECT
    COUNT(*)::bigint as total_players,
    SUM(has_been_crawled)::bigint as players_with_matches,
    COUNT(*) - SUM(has_been_crawled) as players_never_crawled,
    ROUND((SUM(has_been_crawled)::numeric / COUNT(*)::numeric) * 100, 1) as crawling_completion_percent
  FROM player_crawl_status;
END;
$$ LANGUAGE plpgsql;

-- Index to improve performance of coverage queries
CREATE INDEX IF NOT EXISTS match_participants_profile_id_idx
ON match_participants (profile_id);

-- Index for player last_seen_at queries
CREATE INDEX IF NOT EXISTS players_last_seen_at_idx
ON players (last_seen_at)
WHERE last_seen_at IS NOT NULL;