# Stats Tab Implementation Plan

## Context
- The home view (`src/app/page.tsx`) currently exposes `leaderboards`, `search`, `favorites`, `replays`, and `support` tabs with shared state for filters, URL syncing, and responsive navigation.
- Premium player analytics reuse accordion-style tables (`MapPerformanceCard`) and matchup heatmaps (`MatchupMatrixCard`) that match the requested visual patterns. Those components live under `src/app/_components/premium/` and fetch data from Supabase RPC helpers defined in `supabase/migrations/0024_advanced_stats_functions.sql`.
- Raw match telemetry (maps, races, outcomes, timestamps) is already stored in Supabase (`matches`, `match_participants`). Public RLS policies allow read-only anon access, so we can expose aggregated global 1v1 stats without premium gating.
- Recharts is available (`recharts@3.2.1`) and already used for the premium Elo chart, making it a natural choice for the new stacked bar visualization.

## Goals
- Add a top-level **Stats** tab surfaced alongside the existing navigation, scoped to 1v1 data.
- Provide three nested views:
  1. **Maps** — list all ranked 1v1 maps with aggregate win rate details, expanding to show per-race performance using the Advanced Statistics accordion style.
  2. **Races pickrate** — stacked weekly bar chart showing global race selection share for 1v1 matches.
  3. **Matchups** — 1v1 race-vs-race heatmap mirroring the premium matchup matrix.
- Ensure server APIs only return 1v1 data, filter out computer opponents, and include sensible caching headers.
- Deliver loading, empty, and error states consistent with the rest of the app’s styling.

## Data Model & API Plan
1. **Supabase SQL helpers**
   - Add a migration that creates security-definer SQL functions for global aggregates:
     - `public.stats_get_map_overview(p_since timestamptz, p_limit integer)` returning totals per map (matches, wins, losses, winrate, last_played).
     - `public.stats_get_map_race_breakdown(p_map_identifier text, p_since timestamptz)` returning per-race win/loss counts for a given map.
     - `public.stats_get_race_pickrate(p_since timestamptz, p_weeks integer)` returning weekly race counts and match totals (using `date_trunc('week', completed_at)`).
     - `public.stats_get_matchup_matrix(p_since timestamptz)` returning race-vs-race aggregates (matches, wins, losses, winrate, last_played).
   - To avoid request-time statement timeouts, introduce summary tables (`stats_map_overview`, `stats_map_race_breakdown`, `stats_race_pickrate`, `stats_matchup_matrix`) populated by a service-role refresh routine (`stats_refresh_global`). An Edge Function (`supabase/functions/stats-refresh`) runs the refresh and can be scheduled nightly via Supabase Cron. Windows are capped to 30 and 90 days for maps/matchups and 24 weeks for pickrates so each refresh stays within Supabase’s statement timeout.
   - Functions should:
     - Filter to `m.match_type_id = 1` (1v1) and `my.is_computer = false`.
     - Normalize `map_identifier` with `coalesce(nullif(trim(m.map_name), ''), 'unknown')` to match the premium schema.
     - Guard against null races by dropping rows where `race_id` is null for matchup/pickrate to keep the visuals clean.
     - Clamp `p_since` defaults to 90 days to keep result sets manageable.

2. **API routes (`src/app/api/stats/*`)**
   - `GET /api/stats/maps`: call `stats_get_map_overview`, allow optional `windowDays` query param (default 90, min 30, max 365), cap results (e.g., top 30 maps) and include `Cache-Control: public, s-maxage=3600`.
   - `GET /api/stats/maps/[id]`: call `stats_get_map_race_breakdown` for a specific `mapIdentifier`; expose per-race rows sorted by matches desc.
   - `GET /api/stats/races`: call `stats_get_race_pickrate`, accepting `weeks` (default 12) and `windowDays` fallback (90) to derive the time window. Shape response for stacked bar (array of {weekStart, totalMatches, factionCounts}).
   - `GET /api/stats/matchups`: call `stats_get_matchup_matrix`, apply `Cache-Control` similar to maps.
   - Reuse existing helper utilities: map display names via `getMapName`, faction labels via `raceIdToFaction`.

## UI Implementation Plan
1. **Tab wiring**
   - Update `TabType` union and related URL state helpers in `src/app/page.tsx` to include `'stats'`.
   - Extend desktop and mobile navigation button sets with a Stats entry.
   - Ensure history/state management (URL syncing, session restore) understands the new tab. Default nested tab to `"maps"` when switching in.

2. **Stats tab container**
   - Create `src/app/_components/stats/StatsTab.tsx` as a client component that handles nested tab state (`"maps" | "pickrate" | "matchups"`), renders sub-navigation, and delegates to the three view components.
   - Provide consistent paddings/backgrounds with existing cards (e.g., `rounded-2xl border bg-neutral-900/70`).
   - Handle mobile layout: nested tabs as pill buttons or segmented control mirroring premium section headers.

3. **Maps view**
   - Component: `StatsMapsPanel.tsx`.
   - Fetch `/api/stats/maps` on mount (with `useEffect`) and display a table akin to `MapPerformanceCard`.
   - Each row toggles expansion; when expanded, lazily fetch `/api/stats/maps/[mapIdentifier]` and render per-race stats inside a bordered container.
   - Columns: Map (with thumbnail via `getMapImage`), total matches, wins, losses, global winrate, last match (human readable). Keep buttons accessible (aria labels, row toggles).
   - Expanded section: table listing each faction with matches, wins, losses, winrate; optionally highlight >50% winrate with positive color.

4. **Races pickrate view**
   - Component: `StatsRacePickrateChart.tsx`.
   - Fetch `/api/stats/races` and transform into `Recharts`-friendly structure (e.g., stack keys for each faction).
   - Render `<ResponsiveContainer><BarChart /></ResponsiveContainer>` with stacked `Bar` elements keyed by faction slug. Provide tooltip showing exact counts and percentages.
   - Include filters (optional): allow user to adjust range (e.g., dropdown for 6/12/24 weeks). Start with static default; document extension in future work.

5. **Matchups view**
   - Component: `StatsMatchupsHeatmap.tsx`.
   - Fetch `/api/stats/matchups` on load. Build a 9×9 grid similar to `MatchupMatrixCard`, but without profile-specific match history.
   - Each cell shows total matches + winrate, using color intensity based on winrate delta from 50%. Provide legend (e.g., gradient bar) to interpret colors.
   - Add hover tooltip summarizing `Faction A vs Faction B: X matches • Y% winrate`.

6. **Shared utilities & styling**
   - Create a small helper in `src/lib/stats-formatters.ts` (or reuse existing ones) for formatting percentages, last played timestamps, and color scales.
   - Reuse faction icon mapping (`assets/factions/*.png`) by extracting shared map (currently duplicated in premium components) into a shared module to avoid copy/paste.

## Validation & Observability
- **Manual checks**
  - Run `npm run dev`, navigate to Stats tab, confirm each sub-tab loads, toggles, and handles empty data gracefully (simulate via query param or temporarily adjusting API).
  - Spot check API responses in browser devtools; verify Cache-Control headers and JSON shapes.
  - Confirm navigation state persists when refreshing on `/` with `?view=stats`.
- **Performance**
  - Monitor Supabase query execution plan (via SQL testing) to ensure aggregates complete quickly; add indexes if needed (e.g., `match_participants(match_id, race_id)` already exists; consider composite on `(race_id, outcome)` if queries are slow).
  - Keep default windows modest (90 days / 12 weeks) to limit payload size.

## Risks & Open Questions
- Aggregating over the entire match history may be expensive; if Supabase latency is high, consider materialized views or scheduled jobs in a follow-up.
- Map identifiers rely on `matches.map_name`, which may vary in casing; normalized identifier must match `mapMetadata`. Need to confirm matching logic or extend metadata map.
- Race pickrate interpretation: counting each participant double counts matches but aligns with “pick” semantics; clarify if we instead want per-match (two picks per match). Current plan assumes per-participant counts.
- Heatmap cell color scale should be finalized with design feedback (e.g., clamp extremes to avoid overly bright cells).

## Rollout Checklist
- [ ] Ship migration adding the new SQL functions.
- [ ] Implement API routes with caching and parameter validation.
- [ ] Build UI components and integrate Stats tab navigation.
- [ ] Verify TypeScript builds locally (`npm run typecheck`) after user review.
- [ ] Capture screenshots for PR / documentation once UI stabilizes.
