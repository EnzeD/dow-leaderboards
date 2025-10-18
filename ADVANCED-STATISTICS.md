# Advanced Statistics

This document captures how premium analytics are delivered across the database, API, and UI layers so the feature can be operated and extended safely.

## Feature Overview
- Inline in the search results, activated profiles surface an `AdvancedStatsPanel` with four analytics cards plus a profile overview summary.
- Cards currently shipped:
  - Profile overview totals (matches, recent activity, ladder record, primary race share).
  - Elo history with a dual-axis Recharts line chart, selectable per leaderboard.
  - Matchup win-rate heatmap by faction (player vs. opponent).
  - Map win-rate table with thumbnail support sourced from map metadata.
  - Frequent opponent head-to-head table.
- Non-activated profiles see a teaser panel with a refresh affordance and optional “Request access” hook for future billing flow.

## Activation & Access Control
- Access is tied to the authenticated user's subscription snapshot (`public.premium_subscriptions`) and linked `app_users.primary_profile_id`. Anonymous visitors or mismatched profiles receive 401/403 responses and the UI falls back to the locked teaser.
- Server-side utilities in `src/lib/premium/subscription-server.ts` expose:
  - `getSupabaseAdmin()` – shared admin client factory.
  - `fetchSubscriptionSnapshot(auth0Sub)` / `upsertSubscriptionSnapshot(payload)` – read/write helpers for the subscription table.
  - `isStripeSubscriptionActive(snapshot)` – evaluates Stripe status + period end to determine if benefits remain active.
  - `attachCacheHeaders(response)` / `resolveSinceDate(windowDays)` – shared HTTP helpers for the premium endpoints.
- Client hook `useAdvancedStatsActivation` calls `/api/premium/activation-status` for the active session, caches the result per profile, and exposes `refresh()` for the teaser UI with specific reasons (e.g. `not_authenticated`, `not_subscribed`, `profile_mismatch`).

## Data Inputs
- `leaderboard_rank_history` – Daily snapshots of rating and rank for the top ~200 players per leaderboard. **Limitation:** premium users outside that cohort have no historic samples yet.
- `match_participants` / `matches` – Source match counts, opponent info, outcome, map identifiers, and completion timestamps.
- `leaderboard_standings` – Current wins/losses per leaderboard, used by the profile overview.
- `players` – Supplies `last_seen_at`/`updated_at` for the “last XP sync” proxy.
- Relic public API – `fetchLeaderboards` + `fetchLeaderboardRows` (see `src/lib/relic.ts`) populate ladder wins/losses and race distribution when computing the profile overview.
- `mapMetadata` – Provides map names and thumbnail paths consumed by `MapPerformanceCard`.

## Backend Interface

### Supabase SQL functions
> All functions are executed through `supabase.rpc`, expect snake_case column names, and return ordered rows.

- `premium_get_elo_history(p_profile_id bigint, p_leaderboard_id integer, p_since timestamptz, p_limit integer)`  
  Reads from `leaderboard_rank_history`, returns snapshots sorted asc; capped to 1,000 rows (`supabase/migrations/0026_fix_elo_history_source_table.sql`).

- `premium_get_matchup_stats(p_profile_id bigint, p_since timestamptz, p_match_type_id integer)`  
  Aggregates win/loss counts by `my_race_id` × `opponent_race_id`; filters out AI participants (`supabase/migrations/0024_advanced_stats_functions.sql`).

- `premium_get_map_stats(p_profile_id bigint, p_since timestamptz, p_match_type_id integer, p_limit integer)`  
  Returns per-map totals, normalised identifiers, and last played timestamps (same migration as above).

- `premium_get_opponent_stats(p_profile_id bigint, p_since timestamptz, p_match_type_id integer, p_limit integer)`  
  Yields frequent opponents with alias fallbacks, ordered by match count (`0024_advanced_stats_functions.sql`).

- `premium_get_profile_overview(p_profile_id bigint)`  
  PL/pgSQL routine that combines match counts with ladder standings and last activity (`supabase/migrations/0027_fix_overview_wins_losses.sql`). Supersedes the earlier SQL-only version in `0025`.

### API routes (`src/app/api/premium/*`)
- `GET /api/premium/activation-status?profileId=` – Auth-required check that validates the caller's `primary_profile_id` and subscription snapshot.
- `GET /api/premium/overview?profileId=` – Server-side computed overview; only resolves when the user is authenticated, linked, and active.
- `GET /api/premium/elo-history?profileId=&leaderboardId=&windowDays=&limit=` – Returns chart samples.
- `GET /api/premium/matchups?profileId=&matchTypeId=&windowDays=` – Provides faction matrix rows with numeric win rates.
- `GET /api/premium/maps?profileId=&matchTypeId=&windowDays=&limit=` – Returns normalised map identifiers plus win/loss splits.
- `GET /api/premium/opponents?profileId=&matchTypeId=&windowDays=&limit=` – Lists the top opponents with head-to-head metadata.

All handlers:
- Require an authenticated session whose `primary_profile_id` matches the requested profile, and an active subscription snapshot (otherwise 401/403).
- Invoke Supabase using `SUPABASE_SERVICE_ROLE_KEY`.
- Apply consistent cache headers via `attachCacheHeaders`.
- Log unexpected errors to aid Vercel function debugging.

## Frontend Modules
- `AdvancedStatsPanel` (`src/app/_components/premium/AdvancedStatsPanel.tsx`) controls activation gating, time-window filter, and section tabs. It supports `variant="embedded"` for inline search results.
- `AdvancedStatsContext` shares activation state and refresh helpers with nested cards.
- Cards:
  - `ProfileOverviewCard` – Handles loading/error placeholders and formats totals.
  - `EloHistoryCard` – Fetches all leaderboards, renders a dual-axis Recharts chart, exposes a leaderboard selector, and shows limited-data messaging.
  - `MatchupMatrixCard` – Renders a colour-coded faction grid with tooltips.
  - `MapPerformanceCard` – Displays map thumbnails when metadata exists and formats win percentages.
  - `FrequentOpponentsCard` – Lists opponents with profile IDs (when present) and head-to-head records.
- `AdvancedStatsTeaser` presents the marketing copy plus refresh/request buttons when the profile is not activated.
- `src/app/page.tsx` embeds the panel beneath the selected search result when the “View advanced statistics” button is pressed.

## Operational Checklist
1. **Environment configuration**
   - Server: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must be available (Vercel project or local `.env`).  
   - Client: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` already power other Supabase reads.  
2. **Migrations to run (Supabase dashboard/CLI)**
   1. `0023_advanced_stats_baseline.sql`
   2. `0024_advanced_stats_functions.sql`
   3. `0026_fix_elo_history_source_table.sql`
   4. `0027_fix_overview_wins_losses.sql` (supersedes the original `0025` definition)
   5. `0030_premium_subscriptions.sql` (drops legacy activations, adds subscription snapshot table)
3. **Subscription seeding**
   - Run through Stripe checkout in test mode to create a customer + subscription; the webhook (or `/api/premium/sync`) will populate `app_users` + `premium_subscriptions`.
   - Profiles outside the top-200 snapshot will only see limited Elo history messaging until broader data capture lands.
4. **Verification**
   - Hit each `/api/premium/*` route with an activated profile to confirm 200 responses.  
   - Load the search UI, open the panel, and ensure charts render (check browser console for Supabase/Relic errors).  
   - Validate cache-control headers and Supabase logs for slow queries.

## Limitations & Follow-ups
- **Snapshot coverage** – Historic Elo data only exists for the leaderboards captured by the current cron (top ~200). A future job should crawl activated profiles regardless of rank and backfill `leaderboard_rank_history`.
- **State persistence** – Time window, match type, and section selection are local state only; shareable URLs remain a TODO.
- **Exports & sharing** – CSV/PNG exports are not yet implemented.
- **Responsive polish** – Charts are optimised for desktop. Additional work is needed for small breakpoints.
- **Testing** – No automated test coverage exists for the SQL functions or premium UI; rely on manual validation for now.
- **Billing integration** – Activation is manual. Stripe or another billing system will be required before general launch.

## Monitoring & Troubleshooting
- Unexpected 401/403 responses usually stem from missing Supabase service credentials or an out-of-sync subscription snapshot—check environment variables first (`src/lib/premium/subscription-server.ts`) and verify the row in `public.premium_subscriptions`.
- The overview route performs Relic API fan-out per leaderboard; transient failures are logged but skipped. Monitor logs for repeated `fetchLeaderboardRows` warnings.
- Recharts renders nothing when <5 snapshots exist; the UI surfaces a limited-data banner but the root cause is typically snapshot scarcity.
