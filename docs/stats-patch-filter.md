# Stats patch filter

The Stats tab's Patch selector applies to the match count, maps, faction pick
rates, matchups, and both levels of map drill-down. It combines with the existing
All / 1200+ / 1400+ ELO filters. All patches preserves the existing rolling windows.
A specific patch uses its whole available period and hides the rolling-window
selector; it does not intersect an old patch with the most recent 30/90 days.

## Dates and data

- Patch boundaries come from the same official Steam release announcements used
  for replay version resolution (`src/lib/replay-game-version.ts`). Stats uses
  **match dates**, not replay upload dates.
- Existing `stats_daily_*` tables retain historical counts. No migration, raw
  match re-import, scheduled task, or production data rewrite is required.
- Daily rows cannot be split at the release timestamp. The filter includes only
  complete UTC days within a patch: the next midnight after its announcement,
  through but excluding the next patch's release day and the unfinished current
  day. A release exactly at UTC midnight can include that entire day.
- The UI displays that rule and the selected date range. Short-lived patches
  may have no complete days; those produce an empty state, not another patch's
  statistics. For example, 2.8.0 covers April 28–June 22, 2026 inclusive.
- This is date-based grouping, not a version extracted from match telemetry.
  Steam publication time is the boundary proxy; completeness still depends on
  the existing match collection and rollup jobs.

## API and aggregation

All six existing Stats endpoints accept `patch=<version>`. Missing `patch` or
`patch=all` leaves their behavior unchanged. Unknown/malformed versions return
400. A selected patch ignores `windowDays`/`weeks`, returns `windowDays: null`,
and adds `patch` (including `startDay`, exclusive `endDay`) and `catalogStale`.
The maps result limit is applied **after** aggregating and sorting the full period.

Queries use the existing rating-floor rollups, date bounds and optional map/race
filters. Daily rows are paginated in primary-key order to avoid Supabase response
limits truncating the totals. Any failed page fails the whole response. Win rates
are recomputed from summed wins / summed matches, matching the existing SQL.
Pick-rate weeks contain only the selected patch's days. Repeated daily match
counts are counted once, not once per faction.

`GET /api/stats/patches` exposes the chronological patch periods. The Stats-only
Steam check has a one-hour server cache and a two-second timeout, merging new
releases with the bundled history. The existing uncached replay-upload check
is unchanged. On Steam failure, a retained cached catalog is bounded by its
verification time; the bundled fallback never extends past its verified cutoff.
Stale responses are not publicly cached and the selector displays a warning.
New patches appear on subsequent page loads after cache refresh; no background
poller or manual patch table maintenance is introduced.

## Validation

After the repository-required user approval:

1. `npm run test:stats-patches` and `npm run test:replay-version`.
2. `npm run typecheck`, `npm run lint`, `npm run build`.
3. In the Stats tab, compare All patches, 2.8.0, 2.10.2 and short-lived 2.3.0.
   Exercise all ELO filters, all three views, both map drill-down levels, and
   rapid filter changes. Confirm patch changes clear old chart/detail data,
   release dates are excluded, and All patches restores rolling-window controls.
4. Check both desktop and mobile layout, empty/error states, and a Steam outage.

Tests cover date boundaries, stale history, weighted rates, weekly deduplication,
pagination beyond 1,000 rows, later-page failures, all six endpoint integrations,
ELO/map/race isolation, and invalid/empty patches. Tests have no network or writes.
