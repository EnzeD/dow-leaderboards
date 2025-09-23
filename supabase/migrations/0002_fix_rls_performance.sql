-- Fix RLS performance issues identified by Supabase linter
-- 1. Fix auth RLS initplan warnings by wrapping auth functions in SELECT subqueries
-- 2. Consolidate multiple permissive policies into single policies per role/action

-- Drop existing RLS policies to recreate them optimized
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop all existing policies on public tables
    FOR r IN (
        SELECT tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- Enable RLS on all tables if not already enabled
ALTER TABLE public.api_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crawl_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshot_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_players_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_report_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_team_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_alias_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_leaderboard_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.races ENABLE ROW LEVEL SECURITY;

-- Create optimized RLS policies
-- Pattern: Single policy per role/action combination
-- Use (SELECT auth.role()) instead of auth.role() to avoid re-evaluation

-- Reference tables (read-only for all, write for service role)
CREATE POLICY "public_read" ON public.races
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.races
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.match_types
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.match_types
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.leaderboards
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.leaderboards
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.leaderboard_mappings
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.leaderboard_mappings
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Player domain tables
CREATE POLICY "public_read" ON public.players
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.players
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.player_alias_history
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.player_alias_history
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.player_leaderboard_stats
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.player_leaderboard_stats
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Match domain tables
CREATE POLICY "public_read" ON public.matches
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.matches
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.match_participants
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.match_participants
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.match_team_results
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.match_team_results
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.match_report_results
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.match_report_results
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.match_players_raw
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.match_players_raw
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Snapshot tables
CREATE POLICY "public_read" ON public.leaderboard_snapshots
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.leaderboard_snapshots
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "public_read" ON public.leaderboard_snapshot_entries
    FOR SELECT TO public
    USING (true);

CREATE POLICY "service_write" ON public.leaderboard_snapshot_entries
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Crawl orchestration tables (restricted read access)
CREATE POLICY "authenticated_read" ON public.crawl_jobs
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.role()) IN ('authenticated', 'service_role')
    );

CREATE POLICY "service_write" ON public.crawl_jobs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "authenticated_read" ON public.crawl_runs
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.role()) IN ('authenticated', 'service_role')
    );

CREATE POLICY "service_write" ON public.crawl_runs
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- API responses table (restricted access)
CREATE POLICY "authenticated_read" ON public.api_responses
    FOR SELECT TO authenticated
    USING (
        (SELECT auth.role()) IN ('authenticated', 'service_role')
    );

CREATE POLICY "service_write" ON public.api_responses
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant SELECT on read-allowed tables to anon and authenticated
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant ALL on all tables to service_role for crawler operations
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Ensure the service role can bypass RLS
ALTER ROLE service_role SET row_security TO off;