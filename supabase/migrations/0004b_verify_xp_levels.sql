-- Verify and ensure xp_levels table exists
-- Run this BEFORE 0005_update_search_with_xp_levels

-- Check if table exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public'
               AND table_name = 'xp_levels') THEN
        RAISE NOTICE 'Table xp_levels exists. Checking row count...';

        DECLARE
            row_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO row_count FROM public.xp_levels;
            RAISE NOTICE 'xp_levels table has % rows', row_count;

            IF row_count = 0 THEN
                RAISE NOTICE 'Table is empty. Please rerun 0004_xp_levels_mapping.sql';
            ELSIF row_count < 250 THEN
                RAISE NOTICE 'Table has incomplete data (% of 250 levels). Please rerun 0004_xp_levels_mapping.sql', row_count;
            ELSE
                RAISE NOTICE 'Table is properly populated with % levels', row_count;
            END IF;
        END;
    ELSE
        RAISE NOTICE 'Table xp_levels does not exist!';
        RAISE NOTICE 'Please run 0004_xp_levels_mapping.sql first';

        -- Try to create just the table structure as a fallback
        CREATE TABLE public.xp_levels (
            level integer PRIMARY KEY,
            xp_required integer NOT NULL,
            cumulative_xp integer NOT NULL,
            xp_min integer NOT NULL,
            xp_max integer NOT NULL
        );
        RAISE NOTICE 'Created empty xp_levels table. Now run 0004_xp_levels_mapping.sql to populate it.';
    END IF;
END $$;

-- Also verify the function exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc
               WHERE proname = 'get_level_from_xp'
               AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        RAISE NOTICE 'Function get_level_from_xp exists';
    ELSE
        RAISE NOTICE 'Function get_level_from_xp does not exist. It should be created by 0004_xp_levels_mapping.sql';
    END IF;
END $$;