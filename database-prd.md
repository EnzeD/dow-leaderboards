# Supabase Database PRD

## 1) Purpose

Establish a persistent Supabase (Postgres) datastore that mirrors and enriches Relic's Dawn of War: Definitive Edition public API. The database must:

- Support the existing leaderboard UI with historical context (daily snapshots, player progress, match timelines).
- Enable future features such as player profile pages, matchup analytics, and alerting without re-crawling upstream data.
- Provide a controlled crawl pipeline that snowballs through `getRecentMatchHistory` to discover new profile IDs and match IDs beyond the daily leaderboards.
- Remain affordable to operate (Supabase Free/Pro tier) and respect Relic API rate limits.

## 2) Core Use Cases

- Rebuild the current UI directly from Supabase (read-heavy queries via REST/edge functions).
- Plot player rating trajectories and win/loss deltas per match.
- Compare faction usage, map frequency, and team compositions.
- Track leaderboard movement day-over-day and expose "gained N ranks" badges.
- Serve future public API endpoints (e.g., `/players/{id}`) from cached data to avoid hammering Relic.

## 3) Data Sources (authoritative)

| Endpoint | Purpose | Key fields surfaced |
| --- | --- | --- |
| `GET /community/leaderboard/GetAvailableLeaderboards?title=dow1-de` | List leaderboard metadata | `leaderboards[].{id,name}`
| `GET /community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=<id>&start=<offset>&count=<n>&sortBy=1` | Ranked rows | `leaderboardStats`, `statGroups.members[].{profile_id,alias,country}`
| `GET /community/leaderboard/getRecentMatchHistory?title=dow1-de&aliases=["<alias>"]&count=200` | Seed profile ↔ match graph | `matchHistoryStats[].{id,mapname,matchtype_id,startgametime,completiontime}`, nested `matchhistorymember[].{profile_id,teamid,race_id,outcome,oldrating,newrating}`
| `GET /community/leaderboard/getRecentMatchHistoryByProfileId?title=dow1-de&profile_id=<id>&count=200` | Same payload when alias is missing | Same as above
| `GET /community/leaderboard/getPersonalStat?title=dow1-de&profile_names=["/steam/<id>"]` | Persistent player info | `statGroups.members[].{alias,country,level,xp}`, `leaderboardStats[].{leaderboard_id,wins,losses,streak,rating,rank,lastmatchdate}`
| `GET /community/external/proxysteamuserrequest?title=dow1-de&request=/ISteamUser/GetPlayerSummaries/v0002/&profile_ids=<csv>` | Steam persona enrichment | `steamResults.response.players[].{relic_profile_id,personaname,avatarfull}`

> All requests must include `title=dow1-de`. Throttle to ≤8 req/s sustained (observed soft limit in current implementation).

## 4) Scope & Non-Goals

**In scope**
- Daily leaderboard snapshots for every leaderboard Relic exposes.
- Full match ledger (snowball crawl) with participants, ratings, factions, and team outcomes.
- Player master data (aliases, Steam IDs, countries, XP/level from personal stats).
- Crawl orchestration tables (jobs, runs, retry counter) to resume mid-way.
- Raw payload retention (compressed JSONB) for replay/debugging.

**Out of scope (initially)**
- Real-time ingestion (<5 minute lag).
- Backfilling beyond the 200 most recent matches per player (unless API supports pagination with `start`).
- Tracking in-match statistics (unit builds, resources) — not exposed via listed endpoints.
- Clan/event/achievement data.

## 5) High-Level Architecture

- **Supabase Postgres** hosts normalized tables plus JSONB raw payload archives.
- **Worker function** (Supabase Edge Function or external cron runner) pulls crawl jobs, hits Relic API, and writes rows via Supabase service role key.
- **Daily cron** triggers two workflows:
  1. Refresh leaderboards and record snapshots.
  2. Seed crawl queue with newly seen profile IDs from snapshots (keeps snowball fresh).
- **Row Level Security (RLS)** enabled on read-facing tables; service role bypasses RLS for ingestion.
- **Supabase storage** optional for static exports (e.g., CSV dumps) — not required MVP.

## 6) Data Model

### 6.1 Reference Tables

- `leaderboards`
  - `id` (int, PK) — Relic leaderboard ID
  - `name` (text)
  - `faction` (text) — derived via existing helper
  - `match_type` (text) — 1v1/2v2/...
  - `created_at` (timestamptz default now())
  - Unique: `(id)`

- `factions`
  - `id` (smallint, PK) — Relic race_id
  - `slug` (text) — `space_marine`, etc.
  - `label` (text)

- `match_types`
  - `id` (int, PK) — `matchtype_id`
  - `label` (text)

### 6.2 Player Domain

- `players`
  - `profile_id` (bigint, PK)
  - `current_alias` (text)
  - `country` (text, nullable)
  - `steam_id64` (text, unique, nullable)
  - `statgroup_id` (bigint, nullable)
  - `level` (int, nullable)
  - `xp` (int, nullable)
  - `first_seen_at` (timestamptz)
  - `last_seen_at` (timestamptz)
  - Indexes: `last_seen_at` for stale detection.

- `player_alias_history`
  - `profile_id` (bigint references players)
  - `alias` (text)
  - `first_seen_at` (timestamptz)
  - `last_seen_at` (timestamptz)
  - Unique: `(profile_id, alias)`

- `player_leaderboard_stats`
  - `profile_id` (bigint references players)
  - `leaderboard_id` (int references leaderboards)
  - `rating` (int)
  - `wins` (int)
  - `losses` (int)
  - `streak` (int)
  - `rank` (int)
  - `last_match_at` (timestamptz)
  - `peak_rank` (int, nullable)
  - `peak_rating` (int, nullable)
  - `region_rank` (int, nullable)
  - `region_total` (int, nullable)
  - Audit columns: `snapshot_at` (timestamptz default now())
  - Primary key: `(profile_id, leaderboard_id, snapshot_at)` to track history.

### 6.3 Match Domain

- `matches`
  - `match_id` (bigint, PK)
  - `match_type_id` (int references match_types)
  - `map_name` (text)
  - `started_at` (timestamptz)
  - `completed_at` (timestamptz)
  - `duration_seconds` (int)
  - `crawled_at` (timestamptz)
  - `source_alias` (text) — alias used to fetch (for debugging)
  - Indexes: `completed_at`, `(match_type_id, completed_at)`

- `match_participants`
  - `match_id` (bigint references matches)
  - `profile_id` (bigint references players)
  - `team_id` (smallint)
  - `race_id` (smallint references factions)
  - `alias_at_match` (text)
  - `outcome` (text enum: `win`, `loss`, `unknown`)
  - `old_rating` (int, nullable)
  - `new_rating` (int, nullable)
  - `rating_delta` (int, nullable)
  - `is_computer` (bool default false) — anticipate bots
  - Primary key: `(match_id, profile_id)`
  - Index: `(profile_id, match_id DESC)` for per-player timelines

- `match_team_results`
  - `match_id` (bigint)
  - `team_id` (smallint)
  - `outcome` (text enum: `win`, `loss`, `unknown`)
  - `team_rating_avg` (numeric, nullable)
  - `team_rating_sigma` (numeric, nullable)
  - Primary key: `(match_id, team_id)`

- `match_players_raw`
  - `match_id` (bigint references matches)
  - `payload` (jsonb, compressed via TOAST)
  - Stores the relevant `matchhistorymember` array for debugging.

### 6.4 Leaderboard Snapshots

- `leaderboard_snapshots`
  - `id` (uuid, PK)
  - `leaderboard_id` (int references leaderboards)
  - `captured_on` (date, stored in UTC)
  - `captured_at` (timestamptz default now())
  - `source` (text, default `cron-daily`)
  - Unique: `(leaderboard_id, captured_on)`

- `leaderboard_snapshot_entries`
  - `snapshot_id` (uuid references leaderboard_snapshots)
  - `rank` (int)
  - `profile_id` (bigint references players)
  - `rating` (int)
  - `wins` (int)
  - `losses` (int)
  - `streak` (int)
  - `winrate` (numeric(5,2))
  - `last_match_at` (timestamptz)
  - Unique: `(snapshot_id, rank)`
  - Index: `(profile_id, snapshot_id)` for progress queries

### 6.5 Crawl Orchestration

- `crawl_jobs`
  - `id` (bigserial, PK)
  - `kind` (enum: `player_matches`, `leaderboard_page`)
  - `payload` (jsonb) — e.g., `{ "profile_id": 123, "alias": "Foo", "cursor": null }`
  - `priority` (int default 10)
  - `run_after` (timestamptz default now())
  - `status` (enum: `pending`, `in_progress`, `done`, `failed`)
  - `attempts` (int default 0)
  - `last_error` (text)
  - Indexes: `status`, `(run_after, status)`

- `crawl_runs`
  - `job_id` (bigint references crawl_jobs)
  - `started_at` (timestamptz)
  - `finished_at` (timestamptz)
  - `success` (bool)
  - `request_count` (int)
  - `notes` (text)

### 6.6 Raw Response Archive

- `api_responses`
  - `id` (bigserial, PK)
  - `endpoint` (text)
  - `request_hash` (text unique) — SHA256 of url+params
  - `status_code` (int)
  - `fetched_at` (timestamptz)
  - `payload` (jsonb)
  - Retention policy: prune >90 days via scheduled task

## 7) Snowball Crawl Strategy

1. **Cold start**: insert all `leaderboard_snapshot_entries` for the latest pull; push unique `profile_id` into `crawl_jobs(kind='player_matches')` with `priority=5`.
2. **Job execution** (worker loop):
   - Claim next `pending` job with `FOR UPDATE SKIP LOCKED` semantics.
   - Resolve alias if missing: attempt personal stats (Steam) or fallback to historical alias.
   - Fetch `getRecentMatchHistory` with `count=200`; if alias fails, call `getRecentMatchHistoryByProfileId`.
   - Upsert `players`, `player_alias_history`, `player_leaderboard_stats` (latest snapshot data) using returned `matchhistorymember` info.
   - For each match:
     - Upsert `matches` (skip if `match_id` already present).
     - Insert participants and team rows (conflict on PK → update `alias_at_match`, ratings, outcome).
     - Store raw JSON in `match_players_raw` for traceability.
   - Extract any new `profile_id` values from participants; enqueue new `crawl_jobs` (guard with NOT EXISTS to avoid flooding).
   - Mark job `done`; on API failure, increment `attempts` and reschedule with exponential backoff respecting rate limits.
3. **Anti-loop controls**:
   - Deduplicate `crawl_jobs` with unique partial index on `(kind, (payload->>'profile_id')) WHERE kind='player_matches'`.
   - Track `players.last_seen_at` to skip reprocessing the same player within a configurable window (e.g., 6 hours).

## 8) Leaderboard Snapshot Workflow

- Scheduled daily at 00:05 UTC (after Relic daily rollover, adjust if needed).
- For each leaderboard ID:
  1. Fetch full list via `fetchAllRows` (batch in steps of 100 until no more data or cap of 500 rows).
  2. Upsert `players` & alias history.
  3. Insert new `leaderboard_snapshots` row (conflict on day → update `captured_at`).
  4. Bulk insert `leaderboard_snapshot_entries` (replace existing via `DELETE` + `INSERT` in transaction).
  5. Append associated `crawl_jobs` for unseen profiles.
- Support ad-hoc snapshot requests by inserting with `source='manual'`.

## 9) Access Patterns & Indexing

- **Player page**: `SELECT * FROM match_participants WHERE profile_id = ? ORDER BY match_id DESC LIMIT 50` (covered by compound index).
- **Match detail**: join `match_participants` + `players` filtered on `match_id` (PK lookups only).
- **Leaderboard trends**: `SELECT captured_on, rank FROM leaderboard_snapshot_entries WHERE profile_id = ? AND leaderboard_id = ? ORDER BY captured_on` (index on `(profile_id, snapshot_id)` + join to snapshot for date).
- **Recent matches feed**: `SELECT * FROM matches ORDER BY completed_at DESC LIMIT N` (index on `completed_at`).
- Maintain foreign keys with `ON DELETE CASCADE` only from snapshot entries → snapshot, participants → matches, to keep referential integrity when pruning raw data.

## 10) Data Freshness & Retention

- **Matches**: Refresh per player at most every 3 hours (configurable) to avoid redundant crawling. Use `players.last_seen_at` to gate.
- **Leaderboards**: Daily snapshots retained indefinitely; consider partitioning by year (native Postgres declarative partition) if row count grows.
- **Raw payloads**: Retain 90 days; schedule `DELETE` or move to cheaper storage.
- **Derived aggregates**: Create materialized views (e.g., player winrate by faction) and refresh nightly.

## 11) Security & Ops

- Enable RLS with policies:
  - Anonymous client can `SELECT` from read-only views (`public_leaderboard_view`, `public_matches_view`).
  - Service role (worker) bypasses RLS for upserts.
- Store worker secrets (service role key) in Supabase Edge Function environment.
- Logging: use Supabase `pg_net` extension or external logger to capture job errors.
- Monitoring: schedule heartbeat row insert (`INSERT INTO crawl_runs`) so alerts can detect stalled crawlers.

## 12) Phased Implementation

1. **MVP**
   - Create core tables (`players`, `matches`, `match_participants`, `leaderboards`, snapshots).
   - Implement daily leaderboard snapshot job writing to Supabase.
   - Build minimal worker to process `player_matches` jobs seeded from leaderboard snapshots.
   - Expose read-only views consumed by Next.js app (replace direct Relic fetch).

2. **Phase 2**
   - Add alias history, raw payload archive, and crawl telemetry tables.
   - Implement exponential backoff + retry policies.
   - Add derived aggregates (e.g., rating progression materialized view).

3. **Phase 3**
   - Introduce API endpoints served directly from Supabase (edge functions/rest).
   - Build admin dashboard for crawl status and manual requeue.
   - Consider Supabase `pgvector` or analytics warehouse export if advanced stats needed.

## 13) Open Questions

- Does Relic allow pagination/offets beyond `count=200`? Need confirmation to avoid missing older matches.
- How stable are `matchtype_id` and `race_id` enumerations? Should we snapshot a reference map from live payloads instead of hardcoding?
- Are computer-controlled participants included (e.g., `outcome` null)? Determine rule for filtering before analytics.
- Preferred cadence for leaderboard snapshots (daily vs multiple/day)?
- Storage sizing: estimate row growth (e.g., matches/day) to validate Supabase tier fits.
- Need webhook or manual trigger when player requests immediate refresh?

