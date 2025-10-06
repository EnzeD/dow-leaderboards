# Advanced Statistics Implementation Plan

## Goals & Scope
- Deliver the four premium analytics views promised in the teaser: Elo trend by leaderboard, matchup win-rate matrix, map win rates, and frequent-opponent performance.
- Restrict visibility to "activated" users; for the first iteration simulate activation without real billing/subscriptions.
- Reuse existing Relic + Supabase data pipelines where possible, adding new aggregation jobs only when query cost would be prohibitive.
- Ship the feature behind an environment flag with graceful fallbacks so non-activated users see the teaser experience.

## Safety & Change Management Principles
- Treat production Supabase data as read-only until migrations are reviewed and approved by a human operator.
- Stage every migration locally first; apply to production only from the Supabase dashboard once validated.
- Prefer additive changes (new tables/views) over destructive edits; never drop or alter existing columns without an explicit rollback plan.
- Keep feature flags disabled by default so new UI/API paths remain inert until activation is confirmed.

## Responsibility Matrix
- **Human operator (Supabase dashboard / tooling)**
  - Review and run SQL migrations (`0023_advanced_stats_baseline.sql`, backfill scripts) in the correct Supabase project.
  - Seed or edit activation rows in `premium_feature_activations` (and future premium tables).
  - Schedule and monitor Supabase cron jobs or external workers that refresh aggregates.
  - Manage environment variables (`NEXT_PUBLIC_FORCE_ADVANCED_STATS`, service keys) in Vercel/Supabase settings.
  - Approve production feature flag flips once validation is complete.
- **Repository work (agent / local development)**
  - Author migrations, API routes, and frontend components with migrations disabled by default.
  - Provide seed/backfill scripts that can be executed manually by the operator.
  - Supply mock data fixtures and feature-flagged UI for safe QA.
  - Document verification steps and sanity checks for each release.

## Activation Strategy (Phase 0) ✅ COMPLETED
- ✅ Added Supabase table `premium_feature_activations` (migration `0023_advanced_stats_baseline.sql`)
  - Fields: `profile_id`, `activated_at`, `expires_at`, `notes`, `created_at`, `updated_at`
  - Primary key on `profile_id`, foreign key to `players(profile_id)`
  - RLS enabled with service role policy
- ✅ Implemented API endpoint `GET /api/premium/activation-status?profileId=...`
  - Returns `{ activated: boolean, activatedAt?: string, expiresAt?: string, reason?: string }`
  - 30s cache headers (`s-maxage=30`)
- ✅ Environment override support for testing:
  - `NEXT_PUBLIC_FORCE_ADVANCED_STATS=true` - Force all profiles activated
  - `NEXT_PUBLIC_FORCE_ADVANCED_STATS_PROFILE=123,456` - Force specific profiles
- ✅ Client hook `useAdvancedStatsActivation(profileId)` with caching
- ✅ Server utility `src/lib/premium/activation-server.ts` with `resolveActivationStatus()`

**TODO (Human operator):**
- Run migration `0023_advanced_stats_baseline.sql` in production Supabase
- Manually insert test users into `premium_feature_activations` table for pilot testing

## Data Architecture

### Source Tables (Existing)
- **`player_leaderboard_stats`**: Time-series snapshots of rating/rank per player per leaderboard
- **`matches`**: Match metadata (map, duration, completion time, match type)
- **`match_participants`**: Player participation with faction, team, outcome, rating deltas
- **`match_team_results`**: Team-level outcomes
- **`players`**: Player profiles with aliases, Steam IDs, XP/level

### Elo History Data Availability ⚠️ IMPORTANT
- **Current snapshot coverage**: Daily cron job captures `player_leaderboard_stats` snapshots for **top 200 players per leaderboard only**
- **Historical depth**: Snapshots started a few days ago (limited historical data currently available)
- **Coverage gap**: Premium users **outside top 200** will have **no Elo history** until a dedicated crawl job is implemented
- **Known limitation**: Elo history will only work for currently top-ranked players in MVP launch

**TODO - Post-MVP (Critical for full premium rollout):**
- Implement background job to snapshot stats for all activated premium users (regardless of rank)
  - Job should run daily alongside existing top-200 cron
  - Query `premium_feature_activations` table to identify profiles requiring snapshot
  - Fetch current stats from Relic API for each activated profile
  - Insert into `player_leaderboard_stats` with current rating/rank
  - Consider rate limiting and batch processing to avoid API throttling (≤8 req/s effective)
  - Fallback gracefully in UI when insufficient historical data exists (<5 snapshots)

### Data Processing Strategy
- **No new aggregate tables**: All stats computed on-demand via SQL functions
- **Time windows**: default 90 days, configurable to 30/60/90/180/365 days
- **Player scoping**: All queries accept `profile_id` + optional `leaderboard_id`
- **Faction mapping**: Reuse existing `races` table and `RACE_ID_TO_FACTION` utils
- **Map metadata**: Reuse `assets/maps.json` for map names/thumbnails

## Backend Work Breakdown

### 1. Schema Additions ✅ COMPLETED
**Migration `0023_advanced_stats_baseline.sql`**
- ✅ Created `premium_feature_activations` table
- ✅ Added RLS policies (service role only)
- ✅ Set up `updated_at` trigger

**Note:** Original plan mentioned aggregate tables (`player_matchup_aggregates`, etc.) but implementation uses **on-demand SQL functions** instead - simpler and leverages existing data.

### 2. SQL Functions ✅ COMPLETED
**Migration `0024_advanced_stats_functions.sql`**
- ✅ `premium_get_elo_history(profile_id, leaderboard_id, since, limit)`
  - Queries `player_leaderboard_stats` for rating/rank snapshots
  - Returns time-series data ordered by `snapshot_at`
  - Filters by leaderboard and time window
- ✅ `premium_get_matchup_stats(profile_id, since, match_type_id)`
  - Joins `match_participants` to pair player with opponents
  - Aggregates wins/losses by faction matchup (my_race_id vs opponent_race_id)
  - Returns winrate matrix data
- ✅ `premium_get_map_stats(profile_id, since, match_type_id, limit)`
  - Aggregates performance by map from `matches` + `match_participants`
  - Returns matches/wins/losses/winrate per map
- ✅ `premium_get_opponent_stats(profile_id, since, match_type_id, limit)`
  - Finds frequent opponents with head-to-head record
  - Joins on opposite teams, excludes computer players

**Migration `0025_premium_profile_overview.sql`**
- ✅ `premium_get_profile_overview(profile_id)`
  - Summary stats: total matches, last 7 days activity
  - Aggregate wins/losses from `player_leaderboard_stats` (latest snapshot per leaderboard)
  - Overall winrate calculation
  - Last XP sync timestamp from `players` table

**TODO (Human operator):**
- Run migrations `0024_advanced_stats_functions.sql` and `0025_premium_profile_overview.sql` in production
- Test each function with sample profile IDs to verify performance (<200ms p95)

### 3. API Endpoints ✅ COMPLETED
All routes implement activation gating (403 if not activated) and 30s cache headers.

- ✅ `GET /api/premium/activation-status?profileId=X`
- ✅ `GET /api/premium/overview?profileId=X`
  - Calls `premium_get_profile_overview()`
  - Returns total matches, recent activity, W/L record, winrate
- ✅ `GET /api/premium/elo-history?profileId=X&leaderboardId=Y&windowDays=90`
  - Calls `premium_get_elo_history()`
  - Returns rating timeline with rank data
- ✅ `GET /api/premium/matchups?profileId=X&windowDays=90`
  - Calls `premium_get_matchup_stats()`
  - Returns faction vs faction matrix
- ✅ `GET /api/premium/maps?profileId=X&windowDays=90`
  - Calls `premium_get_map_stats()`
  - Returns map performance table
- ✅ `GET /api/premium/opponents?profileId=X&windowDays=90&limit=10`
  - Calls `premium_get_opponent_stats()`
  - Returns top opponents list

**Cache Strategy:**
- All routes use `Cache-Control: private, max-age=0, s-maxage=30`
- Client-side activation status cached in-memory per profile

**Security:**
- All routes verify activation via `resolveActivationStatus()`
- Uses Supabase service role client for privileged queries
- No authentication required (public API, gated by activation table)

**TODO (Future):**
- Consider adding audit logging table `premium_feature_audit` for billing instrumentation
- Add rate limiting per IP if abuse occurs

## Frontend Work Breakdown

### 1. Activation Gating ✅ COMPLETED
- ✅ React hook `useAdvancedStatsActivation(profileId)` (`src/hooks/useAdvancedStatsActivation.ts`)
  - Checks env overrides first, then API
  - In-memory cache to avoid repeated calls
  - Returns `{ activated, loading, refresh, error, ... }`
- ✅ Context provider `AdvancedStatsContext` for sharing activation state

### 2. Core Panel Component ✅ COMPLETED
- ✅ `AdvancedStatsPanel.tsx` - Main container
  - Orchestrates teaser vs full stats views
  - Filter controls: time window (30/60/90/180/365 days) + leaderboard selector
  - Tab navigation: Elo History | Matchups | Maps | Opponents
  - Supports `variant="embedded"` (inline in search) and `"standalone"`
  - Fetches profile overview on mount
- ✅ `AdvancedStatsTeaser.tsx` - Shown when not activated
  - Explains premium features
  - "Request Access" button (calls `onRequestAccess` prop)
- ✅ `useCombinedLeaderboards.ts` - Hook to fetch all leaderboards for filters

### 3. Stats Card Components ✅ IMPLEMENTED
- ✅ `ProfileOverviewCard.tsx`
  - Displays total matches, last 7 days activity, W/L record, winrate
  - Loading/error states
- ✅ `EloHistoryCard.tsx`
  - Fetches data from `/api/premium/elo-history`
  - Renders line chart (implementation TBD - chart library needed)
  - Filters by selected leaderboard + time window
- ✅ `MatchupMatrixCard.tsx`
  - Fetches data from `/api/premium/matchups`
  - Renders heatmap grid (implementation TBD)
  - Color-coded winrate (red = low, green = high)
- ✅ `MapPerformanceCard.tsx`
  - Fetches data from `/api/premium/maps`
  - Sortable table with map names, matches, W/L, winrate
  - Map thumbnails TBD
- ✅ `FrequentOpponentsCard.tsx`
  - Fetches data from `/api/premium/opponents`
  - Top 10 opponents list with head-to-head records
  - Links to opponent profiles TBD

**TODO (Chart Implementation):**
- Install chart library (`recharts`, `chart.js`, or `visx`)
- Implement actual line chart in `EloHistoryCard`
- Implement heatmap visualization in `MatchupMatrixCard`
- Add map thumbnail images and integrate into `MapPerformanceCard`
- Add "Insufficient data" fallback messaging when <5 data points

### 4. UI Integration ✅ COMPLETED
**Changes to `src/app/page.tsx`:**
- ✅ Removed "Stats" tab placeholder (was showing "Coming Soon")
- ✅ Added "Activate advanced statistics" button in search results
  - Toggles `AdvancedStatsPanel` in embedded mode
  - Shows inline below the selected player's search result
  - Shows teaser if not activated, full stats if activated
- ✅ State management for active advanced stats panel per player

### 5. State Management & UX ⚠️ PARTIAL
- ✅ Filter state managed in `AdvancedStatsPanel` (time window, leaderboard)
- ✅ Active section tab state
- ⚠️ TODO: Persist filters in query string for shareable links
- ⚠️ TODO: Export buttons (CSV/PNG) - stubbed out for future
- ⚠️ TODO: Mobile responsive chart layouts

## Testing & Validation ⚠️ NOT STARTED

**TODO:**
- Backend integration tests for SQL functions
- Frontend unit tests for data formatting utilities
- Screenshot/visual regression tests for charts (Playwright)
- Performance testing (k6/artillery) - target p95 < 200ms
- Data QA - verify aggregate correctness against raw match data samples

## Rollout Steps

### Completed ✅
1. ✅ Migrations authored and committed to repo
2. ✅ Backend API endpoints implemented with activation gating
3. ✅ Frontend components built with teaser/activated branching
4. ✅ Environment override system for local development

### Remaining (Human Operator) ⚠️
1. **Database migrations** (Supabase Dashboard):
   - Apply `0023_advanced_stats_baseline.sql` (creates `premium_feature_activations`)
   - Apply `0024_advanced_stats_functions.sql` (creates SQL functions)
   - Apply `0025_premium_profile_overview.sql` (creates overview function)
   - Verify no long-running queries or lock contention

2. **Pilot user activation**:
   - Manually insert test users into `premium_feature_activations`:
     ```sql
     INSERT INTO premium_feature_activations (profile_id, notes)
     VALUES (123456, 'Internal testing - top 200 player');
     ```
   - Test with both top-200 players (have Elo history) and lower-ranked players (no Elo history)

3. **Production deployment**:
   - Merge `feat/advanced-stats` branch to `main`
   - Deploy to Vercel (migrations already applied)
   - Verify all API endpoints return 403 for non-activated users
   - Test activation flow with pilot users

4. **Monitoring**:
   - Check Supabase query performance dashboard
   - Monitor API response times (should be <200ms p95)
   - Verify cache hit rates

5. **Feature flag consideration** (optional):
   - Currently no global feature flag - activation is per-user
   - Consider adding `NEXT_PUBLIC_ENABLE_ADVANCED_STATS` if you need global kill switch

## Known Limitations & Future Work

### Critical for Full Rollout
1. **Elo history coverage gap** (see Data Architecture section above)
   - Only top 200 players have snapshots currently
   - Need dedicated cron job for premium users outside top 200
   - Fallback UI needed when <5 snapshots available

2. **Chart visualization incomplete**
   - Card components exist but need chart library integration
   - Line chart for Elo history
   - Heatmap for matchup matrix

3. **Map thumbnails missing**
   - `MapPerformanceCard` references map images that may not exist yet
   - Need to add map preview images to `/public/maps/`

### Nice-to-Have (Post-MVP)
- Query string persistence for filter state (shareable links)
- Export to CSV/PNG functionality
- Mobile-optimized chart layouts
- Billing integration (replace manual activation with Stripe)
- Audit logging for access tracking
- Advanced analytics: build orders, teammate synergy, time-of-day performance
- Edge caching for heavy charts if adoption spikes

## Summary of Implementation Status

| Component | Status | Notes |
|-----------|--------|-------|
| Database schema | ✅ Complete | 3 migrations ready to apply |
| SQL functions | ✅ Complete | All 5 functions implemented |
| API endpoints | ✅ Complete | 6 routes with activation gating |
| Activation system | ✅ Complete | Hook + server utilities + env overrides |
| Frontend panel | ✅ Complete | Main container + tab navigation |
| Stats cards | ⚠️ Partial | Components exist, charts need implementation |
| UI integration | ✅ Complete | Embedded in search results |
| Testing | ❌ Not started | Need integration + performance tests |
| Production deployment | ❌ Pending | Awaiting migration application + pilot testing |
| Elo history for all users | ❌ Future work | Only top 200 covered currently |
