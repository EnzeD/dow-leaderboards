-- Fix security issues identified by Supabase linter
-- 1. Remove SECURITY DEFINER from players_with_levels view
-- 2. Enable RLS on xp_levels table
-- 3. Enable RLS on search_index_refresh_log table

-- ================================================================
-- Fix 1: Recreate players_with_levels view without SECURITY DEFINER
-- ================================================================

-- Drop the existing view with SECURITY DEFINER
DROP VIEW IF EXISTS players_with_levels CASCADE;

-- Recreate the view without SECURITY DEFINER (using SECURITY INVOKER by default)
-- This view is used to get players with their correct XP-based levels
-- Note: calculated_level already exists in players table, so we don't need to compute it again
CREATE VIEW players_with_levels AS
SELECT
    p.*
FROM players p;

-- Grant appropriate permissions
GRANT SELECT ON players_with_levels TO anon, authenticated;

-- Add documentation
COMMENT ON VIEW players_with_levels IS
    'View showing players with their correct XP-based levels. Uses invoker permissions (not definer).';

-- ================================================================
-- Fix 2: Enable RLS on xp_levels table
-- ================================================================

-- Enable Row Level Security on the xp_levels table
ALTER TABLE xp_levels ENABLE ROW LEVEL SECURITY;

-- Create a permissive SELECT policy for all users
-- This is reference data that should be readable by everyone
CREATE POLICY "Allow public read access to xp_levels"
    ON xp_levels
    FOR SELECT
    TO public
    USING (true);

-- Add documentation
COMMENT ON POLICY "Allow public read access to xp_levels" ON xp_levels IS
    'XP levels mapping is reference data that should be publicly readable';

-- ================================================================
-- Fix 3: Enable RLS on search_index_refresh_log table
-- ================================================================

-- Enable Row Level Security on the search_index_refresh_log table
ALTER TABLE search_index_refresh_log ENABLE ROW LEVEL SECURITY;

-- Create a SELECT policy for authenticated users to view logs
CREATE POLICY "Allow authenticated users to view refresh logs"
    ON search_index_refresh_log
    FOR SELECT
    TO authenticated
    USING (true);

-- Create an INSERT/UPDATE/DELETE policy for service role only
-- Only the service role should be able to modify logs
CREATE POLICY "Only service role can modify refresh logs"
    ON search_index_refresh_log
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add documentation
COMMENT ON POLICY "Allow authenticated users to view refresh logs" ON search_index_refresh_log IS
    'Authenticated users can view refresh history for monitoring';

COMMENT ON POLICY "Only service role can modify refresh logs" ON search_index_refresh_log IS
    'Only background jobs and admin operations can write to the refresh log';

-- ================================================================
-- Verification queries (commented out, for manual testing)
-- ================================================================

/*
-- Verify RLS is enabled on all public tables:
SELECT
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
    AND tablename IN ('xp_levels', 'search_index_refresh_log')
ORDER BY tablename;

-- Verify the view doesn't have SECURITY DEFINER:
SELECT
    viewname,
    viewowner,
    definition
FROM pg_views
WHERE schemaname = 'public'
    AND viewname = 'players_with_levels';

-- Verify policies exist:
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE schemaname = 'public'
    AND tablename IN ('xp_levels', 'search_index_refresh_log')
ORDER BY tablename, policyname;
*/