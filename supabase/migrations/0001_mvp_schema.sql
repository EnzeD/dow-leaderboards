-- Dawn of War Definitive Edition leaderboard MVP schema
-- Grounded in `/database-prd.md` Sections 6-12 and validated against live Relic payloads.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
    CREATE TYPE match_outcome AS ENUM ('win', 'loss', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE crawl_job_kind AS ENUM ('player_matches', 'leaderboard_page');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE crawl_job_status AS ENUM ('pending', 'in_progress', 'done', 'failed');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Reference data -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS match_types (
    id            integer PRIMARY KEY,
    label         text    NOT NULL,
    locstring_id  integer
);

CREATE UNIQUE INDEX IF NOT EXISTS match_types_label_idx ON match_types (lower(label));

CREATE TABLE IF NOT EXISTS races (
    id          smallint PRIMARY KEY,
    slug        text     NOT NULL,
    label       text     NOT NULL,
    faction_id  smallint,
    UNIQUE (lower(slug))
);

CREATE TABLE IF NOT EXISTS leaderboards (
    id                      integer PRIMARY KEY,
    name                    text        NOT NULL,
    display_name            text,
    is_ranked               boolean     NOT NULL DEFAULT true,
    default_match_type_id   integer     REFERENCES match_types(id),
    default_race_id         smallint    REFERENCES races(id),
    default_statgroup_type  smallint,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leaderboards_name_idx ON leaderboards (lower(name));

DO $$ BEGIN
    CREATE TRIGGER leaderboards_set_updated_at
    BEFORE UPDATE ON leaderboards
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS leaderboard_mappings (
    leaderboard_id  integer   NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
    match_type_id   integer   NOT NULL REFERENCES match_types(id),
    statgroup_type  smallint  NOT NULL,
    race_id         smallint  NOT NULL REFERENCES races(id),
    PRIMARY KEY (leaderboard_id, match_type_id, statgroup_type, race_id)
);

-- Player domain -------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS players (
    profile_id     bigint       PRIMARY KEY,
    current_alias  text,
    country        text,
    steam_id64     text UNIQUE,
    statgroup_id   bigint,
    level          integer,
    xp             integer,
    first_seen_at  timestamptz  NOT NULL DEFAULT now(),
    last_seen_at   timestamptz  NOT NULL DEFAULT now(),
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS players_last_seen_idx ON players (last_seen_at);
CREATE UNIQUE INDEX IF NOT EXISTS players_statgroup_idx ON players (statgroup_id) WHERE statgroup_id IS NOT NULL;

DO $$ BEGIN
    CREATE TRIGGER players_set_updated_at
    BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS player_alias_history (
    profile_id     bigint       NOT NULL REFERENCES players(profile_id) ON DELETE CASCADE,
    alias          text         NOT NULL,
    first_seen_at  timestamptz  NOT NULL,
    last_seen_at   timestamptz  NOT NULL,
    PRIMARY KEY (profile_id, alias)
);

CREATE TABLE IF NOT EXISTS player_leaderboard_stats (
    profile_id          bigint       NOT NULL REFERENCES players(profile_id) ON DELETE CASCADE,
    leaderboard_id      integer      NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
    rating              integer,
    wins                integer,
    losses              integer,
    streak              integer,
    rank                integer,
    rank_total          integer,
    rank_level          integer,
    disputes            integer,
    drops               integer,
    region_rank         integer,
    region_rank_total   integer,
    last_match_at       timestamptz,
    peak_rank           integer,
    peak_rank_level     integer,
    peak_rating         integer,
    snapshot_at         timestamptz  NOT NULL DEFAULT now(),
    PRIMARY KEY (profile_id, leaderboard_id, snapshot_at)
);

CREATE INDEX IF NOT EXISTS player_leaderboard_stats_latest_idx
    ON player_leaderboard_stats (profile_id, leaderboard_id, snapshot_at DESC);

-- Match domain --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS matches (
    match_id           bigint       PRIMARY KEY,
    match_type_id      integer      NOT NULL REFERENCES match_types(id),
    map_name           text,
    description        text,
    max_players        smallint,
    creator_profile_id bigint,
    started_at         timestamptz,
    completed_at       timestamptz,
    duration_seconds   integer,
    observer_total     integer,
    crawled_at         timestamptz,
    source_alias       text,
    options_blob       text,
    slot_info_blob     text
);

CREATE INDEX IF NOT EXISTS matches_completed_at_idx ON matches (completed_at);
CREATE INDEX IF NOT EXISTS matches_type_completed_idx ON matches (match_type_id, completed_at);

CREATE TABLE IF NOT EXISTS match_participants (
    match_id         bigint        NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    profile_id       bigint        NOT NULL REFERENCES players(profile_id),
    team_id          smallint,
    race_id          smallint      REFERENCES races(id),
    statgroup_id     bigint,
    alias_at_match   text,
    outcome          match_outcome NOT NULL DEFAULT 'unknown',
    outcome_raw      smallint,
    wins             integer,
    losses           integer,
    streak           integer,
    arbitration      smallint,
    report_type      smallint,
    old_rating       integer,
    new_rating       integer,
    rating_delta     integer,
    is_computer      boolean       NOT NULL DEFAULT false,
    PRIMARY KEY (match_id, profile_id)
);

CREATE INDEX IF NOT EXISTS match_participants_profile_timeline_idx
    ON match_participants (profile_id, match_id DESC);

CREATE TABLE IF NOT EXISTS match_team_results (
    match_id           bigint        NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    team_id            smallint      NOT NULL,
    outcome            match_outcome NOT NULL DEFAULT 'unknown',
    team_rating_avg    numeric,
    team_rating_sigma  numeric,
    PRIMARY KEY (match_id, team_id)
);

CREATE TABLE IF NOT EXISTS match_report_results (
    match_id        bigint       NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
    profile_id      bigint       NOT NULL REFERENCES players(profile_id),
    result_type     smallint,
    team_id         smallint,
    race_id         smallint     REFERENCES races(id),
    xp_gained       integer,
    counters        jsonb,
    match_start_at  timestamptz,
    PRIMARY KEY (match_id, profile_id)
);

CREATE TABLE IF NOT EXISTS match_players_raw (
    match_id  bigint PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
    payload   jsonb  NOT NULL
);

-- Leaderboard snapshots -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS leaderboard_snapshots (
    id              uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    leaderboard_id  integer      NOT NULL REFERENCES leaderboards(id),
    captured_on     date         NOT NULL,
    captured_at     timestamptz  NOT NULL DEFAULT now(),
    source          text         NOT NULL DEFAULT 'cron-daily',
    total_players   integer,
    UNIQUE (leaderboard_id, captured_on)
);

CREATE TABLE IF NOT EXISTS leaderboard_snapshot_entries (
    snapshot_id        uuid         NOT NULL REFERENCES leaderboard_snapshots(id) ON DELETE CASCADE,
    rank               integer      NOT NULL,
    profile_id         bigint       NOT NULL REFERENCES players(profile_id),
    statgroup_id       bigint,
    rating             integer,
    wins               integer,
    losses             integer,
    streak             integer,
    disputes           integer,
    drops              integer,
    rank_total         integer,
    rank_level         integer,
    region_rank        integer,
    region_rank_total  integer,
    highest_rank       integer,
    highest_rank_level integer,
    highest_rating     integer,
    winrate            numeric(5, 2),
    last_match_at      timestamptz,
    PRIMARY KEY (snapshot_id, rank),
    UNIQUE (snapshot_id, profile_id)
);

CREATE INDEX IF NOT EXISTS leaderboard_snapshot_entries_profile_idx
    ON leaderboard_snapshot_entries (profile_id, snapshot_id);

-- Crawl orchestration --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS crawl_jobs (
    id          bigserial        PRIMARY KEY,
    kind        crawl_job_kind   NOT NULL,
    payload     jsonb            NOT NULL,
    priority    integer          NOT NULL DEFAULT 10,
    run_after   timestamptz      NOT NULL DEFAULT now(),
    status      crawl_job_status NOT NULL DEFAULT 'pending',
    attempts    integer          NOT NULL DEFAULT 0,
    last_error  text,
    created_at  timestamptz      NOT NULL DEFAULT now(),
    updated_at  timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawl_jobs_status_idx ON crawl_jobs (status);
CREATE INDEX IF NOT EXISTS crawl_jobs_run_after_status_idx ON crawl_jobs (run_after, status);

CREATE UNIQUE INDEX IF NOT EXISTS crawl_jobs_profile_dedupe_idx
    ON crawl_jobs ((payload->>'profile_id'))
    WHERE kind = 'player_matches';

DO $$ BEGIN
    CREATE TRIGGER crawl_jobs_set_updated_at
    BEFORE UPDATE ON crawl_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS crawl_runs (
    job_id         bigint       NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
    started_at     timestamptz  NOT NULL,
    finished_at    timestamptz,
    success        boolean      NOT NULL DEFAULT false,
    request_count  integer,
    error_message  text,
    notes          text,
    PRIMARY KEY (job_id, started_at)
);

-- Raw response archive ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS api_responses (
    id             bigserial PRIMARY KEY,
    endpoint       text      NOT NULL,
    request_hash   text      NOT NULL,
    status_code    integer,
    fetched_at     timestamptz NOT NULL DEFAULT now(),
    duration_ms    integer,
    payload        jsonb     NOT NULL,
    UNIQUE (request_hash)
);

CREATE INDEX IF NOT EXISTS api_responses_endpoint_idx ON api_responses (endpoint);
