# Advanced Statistics

This guide documents the Advanced Statistics feature (premium analytics) so the UI, API, and data flow can be maintained, debugged, and extended safely.

## Feature Overview
- The search page renders `AdvancedStatsPanel` beneath a player card when the user selects “View advanced statistics”. The panel operates in `variant="embedded"` mode in this context.
- Activated users see a profile overview header plus four sections—rating history, matchup matrix, map performance, and frequent opponents—driven by a shared time-window selector (30, 60, 90, 180, or 365 days).
- Each section is implemented as its own client component and fetches the relevant `/api/premium/*` endpoint. Loading, empty, and failure states are handled inside each card.
- Locked users see `LockedAdvancedStatsPreview`, which reuses the section navigation but overlays upgrade messaging, CTA wiring, and status-specific guidance. When users hide the full panel, the search page swaps in `AdvancedStatsCollapsedPreview`.
- `AdvancedStatsTeaser` provides a standalone marketing teaser for other surfaces; it is not currently rendered inside `AdvancedStatsPanel`.

## Activation & Access Control
- Activation is evaluated per Auth0 user:
  1. `auth0.getSession()` must resolve (anonymous visitors receive `401 not_authenticated`).
  2. The account must have `app_users.primary_profile_id` populated.
  3. The requested `profileId` must match that primary profile (`403 profile_mismatch` otherwise).
  4. `public.premium_subscriptions` must contain an active Stripe snapshot (statuses `active`, `trialing`, or `past_due`) whose `current_period_end` is in the future.
- `useAdvancedStatsActivation` (`src/hooks/useAdvancedStatsActivation.ts`) calls `GET /api/premium/activation-status?profileId=…`, caches the payload per profile id, and exposes `refresh()` so the locked preview and account page can retry.
- Response reasons surfaced to the UI:
  - `not_authenticated` → sign-in required (401).
  - `profile_not_linked` → no `primary_profile_id` (403).
  - `profile_mismatch` → viewing another player (403).
  - `not_subscribed` → subscription required (403 for data routes, **200** with `activated: false` for `/activation-status` to allow upgrade copy).
  - `supabase_unavailable` → service-role client missing (503).
  - `lookup_failed`, `rpc_failed`, `unexpected_error` → internal failures (500) with server logs tagged `[premium]`.
- Helpers in `src/lib/premium/subscription-server.ts` provide the service-role Supabase client (`getSupabaseAdmin`), subscription snapshot helpers, `isStripeSubscriptionActive`, `attachCacheHeaders` (sets `Cache-Control: private, max-age=0, s-maxage=30`), and `resolveSinceDate` (clamps `windowDays` to ≤365).
- The hook flags network issues as `reason: "fetch_error"`; the UI keeps the panel locked until `refresh()` succeeds.

## Data Sources & Processing
### Profile Overview (`/api/premium/overview`)
- Supabase queries (service role):
  - `match_participants` joined to `matches` (ignores computer opponents) for total matches and matches within the last 7 days.
  - `players` for `last_seen_at` and `updated_at` (combined as `last_xp_sync` internally, though the current response omits it).
- Live Relic API calls (`fetchLeaderboards`, `fetchLeaderboardRows`) fetch up to 200 rows per non-custom leaderboard. Wins/losses are summed across these rows, and `parseFactionFromName` is used to derive the primary race and share of total ladder matches. Profiles outside the top 200 may therefore show incomplete ladder totals.
- Response fields: `matches`, `matchesLast7Days`, `leaderboardWins`, `leaderboardLosses`, `leaderboardTotal`, `leaderboardWinrate`, `mainRace`, `mainRacePercentage`.

### Rating History (`/api/premium/elo-history`)
- Backed by the Supabase RPC `premium_get_elo_history` (see `supabase/migrations/0026_fix_elo_history_source_table.sql`). The function selects from `public.leaderboard_rank_history`, returning `(snapshot_at, leaderboard_id, rating, rank, rank_total)` sorted ascending. `rank_total` is currently `NULL` because Relic does not provide it.
- Query params: `profileId` (required), optional `leaderboardId`, `windowDays` (default 90, capped at 365 by `resolveSinceDate`), `limit` (default 200, min 10, max 1,000).
- The card requests all leaderboards in a single call, filters client-side, and fetches human-readable leaderboard names via the public Supabase JS client (`src/lib/supabase.ts`) using the `leaderboards` table.

### Matchup Matrix (`/api/premium/matchups`)
- Calls `premium_get_matchup_stats` (defined in `supabase/migrations/0024_advanced_stats_functions.sql`). The function joins `match_participants` twice to exclude computer opponents and aggregates `(matches, wins, losses, winrate, last_played)` per `my_race_id` × `opponent_race_id`.
- Query params: `profileId`, optional `matchTypeId`, `windowDays` (default 90). The UI currently sends `matchTypeId = null`.
- The card renders a 9×9 grid using `raceIdToFaction` (`src/lib/race-utils.ts`) to translate race ids 0–8 into faction labels.

### Map Performance (`/api/premium/maps`)
- Uses `premium_get_map_stats` (also in `0024_advanced_stats_functions.sql`). Map identifiers are normalised (blank values become `"unknown"`), and the return set is limited to between 10 and 200 maps.
- Query params: `profileId`, optional `matchTypeId`, `windowDays`, `limit` (default 50).
- The UI augments rows with `getMapName`/`getMapImage` from `src/lib/mapMetadata.ts` to render canonical map names and thumbnails.

### Frequent Opponents (`/api/premium/opponents`)
- Depends on `premium_get_opponent_stats` (`0024_advanced_stats_functions.sql` plus policy update in `0032_update_premium_opponent_scope.sql`). The function filters to human opponents, joins `players` for current aliases, and returns `(opponent_profile_id, opponent_alias, matches, wins, losses, winrate, last_played)`, sorted by match count and recency.
- Query params: `profileId`, optional `matchTypeId`, optional `matchScope` (`all` default, `automatch` → RPC `p_match_type_id = -1`, `custom` → `-2`), `windowDays`, `limit` (default 10, capped at 50).
- The API normalises aliases/profile ids before returning JSON so the card has deterministic fallbacks.

## Supabase Schema & RPC Summary
- `premium_get_elo_history(p_profile_id bigint, p_leaderboard_id integer, p_since timestamptz, p_limit integer)` – reads `leaderboard_rank_history`.
- `premium_get_matchup_stats(p_profile_id bigint, p_since timestamptz, p_match_type_id integer)` – aggregates faction matchups from `match_participants`/`matches`.
- `premium_get_map_stats(p_profile_id bigint, p_since timestamptz, p_match_type_id integer, p_limit integer)` – returns per-map statistics with bounded result sizes.
- `premium_get_opponent_stats(p_profile_id bigint, p_since timestamptz, p_match_type_id integer, p_limit integer)` – returns most frequent human opponents.
- `premium_get_profile_overview(p_profile_id bigint)` – available PL/pgSQL helper (see `supabase/migrations/0027_fix_overview_wins_losses.sql`), currently unused because the API recomputes the overview to incorporate live Relic data.
- Schema prerequisites:
  - `public.premium_subscriptions` (`0030_premium_subscriptions.sql`) with policies in `0031_enable_rls_on_premium_subscriptions.sql`.
  - `public.app_users` (`0028_app_users_auth0.sql`, `0029_app_users_subscription_status.sql`) for Auth0 linkage.
  - Populated gameplay tables (`match_participants`, `matches`, `leaderboard_rank_history`, `players`, `leaderboards`).

## API Surface (`src/app/api/premium/*`)
- `GET /api/premium/activation-status?profileId=123`  
  Returns `200` on success regardless of activation state, with `activated`, `profileId`, `status`, `cancelAtPeriodEnd`, `currentPeriodEnd`, and optional `reason`. Error statuses use the reason codes above.
- `GET /api/premium/overview?profileId=123`  
  Requires an active subscription; responds with the overview totals or `403 not_subscribed`. Other failures mirror the activation route.
- `GET /api/premium/elo-history?profileId=123&leaderboardId=1&windowDays=90&limit=200`  
  Returns `samples[]`, `windowStart`, and `generatedAt` when activated.
- `GET /api/premium/matchups?profileId=123&matchTypeId=1&windowDays=90`  
  Returns `rows[]` with faction ids, win rates, and last-played timestamps.
- `GET /api/premium/maps?profileId=123&matchTypeId=1&windowDays=90&limit=25`  
  Returns `rows[]` with map identifiers, names, win/loss splits, and recency.
- `GET /api/premium/opponents?profileId=123&matchTypeId=1&matchScope=automatch&windowDays=90&limit=10`  
  Returns `rows[]` with opponent metadata, records, win rates, and last-played timestamps.
- All handlers instantiate the Supabase service client via `getSupabaseAdmin()`, set cache headers, and log unexpected failures with a `[premium]` prefix for easier filtering in Vercel logs.

## Frontend Modules
- `AdvancedStatsPanel` (`src/app/_components/premium/AdvancedStatsPanel.tsx`) orchestrates activation, overview fetching, time-window state, section navigation, locked preview messaging, and CTA wiring. Props: `profileId`, `alias`, optional `activatedOverride`, `onRequestAccess`, `ctaState`, `variant`.
- `AdvancedStatsContext` / `useAdvancedStatsContext` share activation state and the `refresh` callback with nested cards.
- Cards:
  - `ProfileOverviewCard` – renders totals, loading skeletons, errors, or “No activity” messaging.
  - `EloHistoryCard` – dual-axis Recharts line chart, leaderboard dropdown populated from Supabase, limited-data warning (<5 samples), optional data table.
  - `MatchupMatrixCard` – faction heatmap with tooltip details for every matchup combination.
  - `MapPerformanceCard` – table with optional map thumbnails and last-played values.
  - `FrequentOpponentsCard` – table showing alias, match count, record, win rate, and last played; gracefully handles missing profile ids.
- Auxiliary components:
  - `LockedAdvancedStatsPreview` – gated marketing panel with upgrade benefits and CTA state.
  - `AdvancedStatsCollapsedPreview` – blurred teaser shown when the full panel is hidden.
  - `AdvancedStatsTeaser` – standalone teaser (unused in the main panel flow but available for reuse).
- Search integration (`src/app/page.tsx`) stores hide/show preferences per profile, limits the “View advanced statistics” CTA to the logged-in profile when a subscription is active, and dispatches upgrade intents to Stripe helpers.

## Environment & Operations
1. **Environment variables**
   - Server: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (service role, **not** the anon key), `AUTH0_*` (existing), Stripe secrets (`STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` or `NEXT_PUBLIC_STRIPE_PRICE_ID`), plus `APP_BASE_URL`/`NEXT_PUBLIC_SITE_URL` for post-checkout redirects.
   - Client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (must allow reading the `leaderboards` table used by `EloHistoryCard`).
2. **Migrations** (apply in order):
   1. `0023_advanced_stats_baseline.sql`
   2. `0024_advanced_stats_functions.sql`
   3. `0026_fix_elo_history_source_table.sql`
   4. `0027_fix_overview_wins_losses.sql`
   5. `0030_premium_subscriptions.sql`
   6. `0031_enable_rls_on_premium_subscriptions.sql`
   7. `0032_update_premium_opponent_scope.sql`
3. **Stripe subscription flow**
   - `POST /api/premium/checkout` creates Stripe Checkout sessions and persists/upserts the customer id on `app_users`.
   - Successful Checkout should be followed by `POST /api/premium/sync` (or a webhook that calls `syncStripeSubscription`) to upsert the subscription snapshot into `premium_subscriptions`.
   - Manual activation for testing: insert/update `premium_subscriptions` with `status='active'` (or `trialing`/`past_due`) and a `current_period_end` set in the future.
4. **Verification**
   - Log in as a linked account, hit `/api/premium/activation-status` and confirm `activated: true`.
   - Exercise each API route with curl or the browser to ensure 200 responses (or intentional empty-state responses) and confirm cache headers.
   - Launch `npm run dev`, open the advanced panel, switch sections, and watch for `[premium]` warnings or Supabase rate-limit errors in the console/server logs.

## Limitations & Follow-ups
- **Leaderboard coverage** – `leaderboard_rank_history` currently tracks only the players scraped by the cron job (roughly the top 200). Profiles outside that cohort will show the “No snapshot data” fallback.
- **Ladder totals** – `/api/premium/overview` sums wins/losses from the first 200 rows per leaderboard, so players ranked lower than 200 might see incomplete totals and misreported primary race share.
- **Match type filters** – Card props support `matchTypeId`, but the UI does not yet expose match type selectors; all calls pass `null`.
- **State persistence** – Time window and section selection live in component state only; there is no URL fragment or sharing mechanism.
- **Exports** – No CSV/PNG export or sharing features exist.
- **Testing** – There is no automated coverage for these Supabase functions or UI components. Manual validation is required after any schema or API change.
- **Performance** – The overview endpoint fans out to every Relic leaderboard per request, which can be slow and may hit Relic rate limits; server-side caching/backfill would help.

## Monitoring & Troubleshooting
- Check the JSON `reason` field on 4xx/5xx responses first. Common cases: missing Auth0 session (`not_authenticated`), no linked profile (`profile_not_linked`), or inactive subscription (`not_subscribed`).
- `503 supabase_unavailable` indicates missing/invalid `SUPABASE_SERVICE_ROLE_KEY`.
- `rpc_failed` means the Supabase RPC does not exist, failed, or was blocked by RLS—re-run migrations and confirm the service role key is used.
- Empty charts/tables typically stem from limited data (`leaderboard_rank_history` coverage, few recent matches, or filtered opponents). Inspect Supabase data directly to confirm ingestion.
- Server logs include a `[premium]` prefix for unexpected failures (overview fan-out errors, RPC issues, activation fetch errors). Review Vercel function logs and Supabase query dashboards when diagnosing issues.
