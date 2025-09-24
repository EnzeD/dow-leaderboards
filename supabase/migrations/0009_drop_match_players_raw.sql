-- Drop redundant raw match payload table now that normalized match data is persisted.
DROP TABLE IF EXISTS public.match_players_raw;
