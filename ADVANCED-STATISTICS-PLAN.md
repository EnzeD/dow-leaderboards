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

## Activation Strategy (Phase 0)
- Add a Supabase table `premium_feature_activations` (`profile_id`, `activated_at`, `expires_at`, `notes`, `created_at`, `updated_at`).
- Seed the table manually for internal testers; provide a simple Supabase SQL script and an admin helper script for local development that toggles activation.
- Expose an API helper `GET /api/premium/activation-status?profileId=...` that returns `{ activated: boolean, expiresAt?: string }`; default to `false` when the table or key is absent so we can simulate activation locally via an env flag (e.g. `NEXT_PUBLIC_FORCE_ADVANCED_STATS_FOR_PROFILE_ID`).
- Cache the activation lookup for a short TTL (30s) inside the Next.js layer to avoid repeatedly hitting Supabase on every render.
- *Human operator checklist:* Run the activation table migration in Supabase after code review, manage the seed data via dashboard SQL editor, and coordinate feature-flag flips when ready.

## Data Architecture
- **Source tables**: leverage `matches`, `match_participants`, `match_team_results`, `leaderboard_snapshots`, and `player_leaderboard_stats`.
- **Normalization helpers**: reuse existing faction-map metadata (`RACE_ID_TO_FACTION`, `assets/maps.json`) to keep labels consistent.
- **Time windows**: default each stat to the last 90 days with options to extend to "All tracked"; keep the window configurable to limit load.
- **Activated player scoping**: All queries must accept `profile_id` + optional `leaderboard_id` to ensure we never compute global aggregates inadvertently.

## Backend Work Breakdown
1. **Schema additions (migration `0023_advanced_stats_baseline.sql`)**
   - Create materialized views or summary tables:
     - `player_rating_timeseries` (profile_id, leaderboard_id, captured_at, rating, source, match_id?) powered by either leaderboard snapshots or per-match rating data.
     - `player_matchup_aggregates` (profile_id, my_faction_id, opponent_faction_id, wins, losses, last_played_at).
     - `player_map_aggregates` (profile_id, map_slug, wins, losses, total_matches, last_played_at).
     - `player_opponent_aggregates` (profile_id, opponent_profile_id, wins, losses, matches, last_played_at, opponent_alias_snapshot).
   - Add indexes on `(profile_id, leaderboard_id)` or analogous keys to support the API filters.
   - Ensure triggers keep `updated_at` fields current (reuse `set_updated_at`).
   - *Human operator:* Execute the migration on staging then production, confirm no locks or long-running queries, and snapshot the database before rollout if possible.

2. **Aggregation jobs**
   - Extend existing crawler / enrichment scripts to populate the new summary tables whenever match data is ingested.
   - For backfill, write a one-off script (Node or SQL function) that iterates historical matches and seeds the aggregates.
   - Schedule nightly refresh jobs (e.g., Supabase cron or hosted script) to recompute the previous 24h window, ensuring stats stay fresh if historical data changes.
   - *Human operator:* Kick off the initial backfill from the Supabase dashboard or CLI during a low-traffic window and monitor for timeouts; configure cron schedules once baseline performance is validated.

3. **API surface** (all behind activation guard)
   - `GET /api/premium/elo-history?profileId&leaderboardId&window=` → returns ordered samples `{ timestamp, rating, source }` plus metadata (current rating, max, min).
   - `GET /api/premium/matchups?profileId&window=` → returns the full 9x9 (or relevant) matrix keyed by factions with counts + winrate; include totals for fallback UI.
   - `GET /api/premium/maps?profileId&leaderboardId?&window=` → returns array of `{ mapId, mapName, matches, wins, losses, winrate, lastPlayed }` sorted by volume.
   - `GET /api/premium/opponents?profileId&leaderboardId?&window=&limit=10` → returns top opponents array with alias, matches, wins, losses, winrate, lastPlayed.
   - Apply caching headers (`s-maxage=120`, `stale-while-revalidate=600`) and short-term in-memory caches per profile to minimize load.
   - Share a common response envelope including `generatedAt` timestamp and window parameters for debugging.

4. **Security & validation**
   - Require either `profileId` query param matching the authenticated Supabase session (future subscription work) or accept only server calls (current release) with server-side gating.
   - Log access attempts in a lightweight Supabase table `premium_feature_audit` to aid future billing instrumentation.
   - *Human operator:* Review audit logs periodically via Supabase dashboard and ensure service keys remain scoped appropriately.

## Frontend Work Breakdown
1. **Activation gating**
   - Add a client utility `useAdvancedStatsActivation(profileId)` that checks the env override first, then the API.
   - Update search result cards and player profile route (when implemented) to branch between teaser vs. advanced stats content.
   - Provide skeleton loaders and "upgrade" messaging fallbacks.

2. **Shared foundations**
   - Create a new layout section (e.g., `src/app/_components/AdvancedStatsPanel.tsx`) to host the four widgets with a consistent header, refresh timestamp, and window selector.
   - Implement reusable filter controls: leaderboard dropdown (prefilled from available ladders), time-range pill switcher, and faction color legend.

3. **Elo Ratings Over Time**
   - Use `react-chartjs-2` or `visx` (already in bundle?) to render a line chart with tooltip, min/max markers, and leaderboard filter.
   - Allow toggling between absolute rating and delta view; include annotation for roster changes when data is available.
   - Handle sparse data gracefully (fallback to step chart or "insufficient data" message).

4. **Win Rate per Match-up**
   - Build a heatmap grid component (9 factions x 9) with color scale ranging from red (low winrate) to green (high) and cell tooltips showing counts.
   - Highlight diagonal cells (mirror match) separately and optionally collapse factions with <5 matches into "Insufficient data" row.
   - Provide toggle between percentage and raw record display for accessibility.

5. **Win Rate per Map**
   - Render a sortable table with map thumbnail (from `assets/maps.json`/`public/maps`), matches, wins, losses, winrate, last played.
   - Support search/filter by map name and include a "minimum matches" filter to hide noisy data.

6. **Frequent Opponents**
   - Display top 10 opponents as a list with avatar placeholder, alias, matches played, record, and winrate trend indicator.
   - Link each opponent to the search/profile flow; include tooltips showing the faction distribution of those matches if data available.

7. **State management & UX polish**
   - Persist selected filters in query string (e.g., `?leaderboard=18&window=90d`) to allow sharing links.
   - Add export buttons (CSV/PNG) for future premium value, stub them out for now with TODOs.
   - Ensure responsive design: charts collapse into stacked cards on mobile.

## Simulation & Local Development
- Add mock activation via `.env.local` flag `NEXT_PUBLIC_FORCE_ADVANCED_STATS=true` and optional `NEXT_PUBLIC_FORCE_ADVANCED_STATS_PROFILE=1234` to bypass API gating during UI work.
- Provide mock JSON fixtures for each API (stored in `public/mock/advanced-stats/`) so the frontend can be developed before backend completion; the fetch hooks can fall back to these fixtures when `NEXT_PUBLIC_USE_MOCK_ADV_STATS` is enabled.
- *Human operator:* Manage real environment variables in Vercel/Supabase dashboards and ensure mock flags stay disabled in production.

## Testing & Validation
- **Backend**: write integration tests (via Supabase SQL + pgTap or Node scripts) covering aggregation correctness, especially for mirrors/2v2+ matches.
- **Frontend**: add unit tests for data formatting utilities and screenshot tests (Playwright) for the heatmap + chart components using mock data.
- **Performance**: load-test the API endpoints using k6 or artillery to ensure p95 < 200ms with realistic cache hit rates.
- **Data QA**: create a verification notebook (Jupyter or SQL doc) comparing Supabase aggregate outputs against sampled raw match data for a few players.

## Rollout Steps
1. Land migrations + backfill scripts, verify in staging database.
2. Deploy backend endpoints, guarded by feature flag and activation table.
3. Merge frontend using mock data path; progressively enable real API in staging.
4. Activate a handful of pilot users (manual insert) and monitor logs + Supabase metrics.
5. Gather feedback, iterate on UI polish, then plan subscription/paywall integration in a follow-up milestone.
- *Human operator:* Own the staging/prod promotion checklist—apply migrations, validate Supabase metrics, and flip any runtime flags only after confirming smoke tests.

## Future Considerations (Post-MVP)
- Replace manual activation with billing/subscription checks (Stripe + webhook) and real-time Supabase row-level security.
- Expand analytics to include build-order insights, teammate synergy, and per-time-of-day performance once core views are stable.
- Evaluate edge caching or pre-rendering for heavy charts if adoption spikes.
