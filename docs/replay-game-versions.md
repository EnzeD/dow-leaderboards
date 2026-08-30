# Replay game versions

The UI keeps the label `Version`. Its value is inferred from **upload time**,
not extracted from `.rec` bytes. Older files uploaded later can therefore be
assigned a newer patch than the one they were recorded with. Steam announcement
publication times are used as release boundaries, not verified deployment times.

## New uploads

- `POST /api/replays` checks the official Steam announcement feed once per upload
  (app `3556750`, feed `steam_community_announcements`, no HTTP cache).
- It selects the most recent recognized patch/hotfix title published no later
  than the server-captured upload timestamp. Previews, beta titles, future posts
  and versions mentioned only in article bodies are ignored.
- The request and response-body reading have a two-second abort deadline. A
  timeout, HTTP error, invalid payload or no recognized release yields `null`;
  the replay upload still proceeds. There is no fallback to the obsolete parser
  range or to the bundled history after a failed live check.
- The result is saved in the existing `game_version` column. The same upload
  timestamp is saved in `created_at`. Parsed data stays unchanged in
  `raw_metadata`, including the parser's original `gameversion`.
- Successful checks survive publication, metadata edits and player-link
  backfills. They do not require a cron, a new table or future deployments while
  Steam keeps the supported announcement title formats.

## Existing replays

At read time, only the legacy strings `2.0.0 - 2.4.0` and `2.0.0 - 2.5.0`
are replaced using `created_at` and the bundled timeline in
`src/lib/replay-game-version.ts`. The launch and 21 numbered announcements were
verified on 2026-08-30. The launch is represented by the `2.0.0` baseline.

This history is not extrapolated past the verification date. Missing/invalid
dates, pre-launch dates and failed live checks remain unknown. Exact saved
versions are preserved. `updated_at` is never used to choose a version.
No database backfill is required, and browsing replays makes no Steam requests.

Source: [official Steam feed](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=3556750&count=100&maxlength=0&feeds=steam_community_announcements).

## Validation

After the repository-required approval, run `npm run test:replay-version`,
`npm run typecheck`, `npm run lint` and `npm run build`.
The focused tests mock Steam and do not upload files or modify production data.
For manual QA, use a development Supabase project: check upload preview,
publication/listing, numeric version-filter order, and upload with Steam failing.
