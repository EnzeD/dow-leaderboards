# Tournament Spotlight Management

## Goal

Replace the expired, hard-coded homepage tournament banner with a small authenticated management tool. Accounts granted the private `can_manage_tournaments` permission can create, edit, preview, activate, deactivate, and archive tournament promotions.

This is a promotion tool only. Registration, participants, brackets, match results, and public tournament archives are out of scope.

## Product rules

- The homepage displays at most one tournament spotlight.
- Activating a tournament replaces the previously active spotlight.
- Activation is manual.
- An active tournament remains visible until midnight UTC immediately after its tournament date, then disappears automatically.
- All authorized tournament managers can edit every tournament.
- Images are supplied as public `https://` URLs; file uploads are out of scope.
- Manager permission is assigned manually in Supabase.
- Archived tournaments and prior versions are private and have no public history page.
- All tournament content and management UI are English-only.

Example permission grant after applying the migration:

```sql
insert into public.app_user_permissions (auth0_sub, can_manage_tournaments)
values ('auth0-user-subject', true)
on conflict (auth0_sub) do update
set can_manage_tournaments = excluded.can_manage_tournaments;
```

The migration also preserves the former Dawn of War World Championship banner as a private archived tournament record.

## Authorization

Store permissions separately from `app_users` in `app_user_permissions`:

- `auth0_sub` references `app_users.auth0_sub` with update/delete cascading.
- `can_manage_tournaments` defaults to `false`.
- RLS is enabled and only the Supabase service role may manage permission rows.

The separate table prevents the broad existing `app_users` self-update policy from becoming a privilege-escalation path.

Every management page and endpoint must:

1. Resolve the Auth0 session.
2. Require the real `SUPABASE_SERVICE_ROLE_KEY`; never fall back to the public anon key.
3. Read the permission for `session.user.sub`.
4. Fail with `401`, `403`, or `503` as appropriate.

The session API may return `canManageTournaments` to control navigation visibility, but client state is never authorization evidence.

## Persistence

### `tournaments`

- UUID identifier
- Name
- Optional short description
- Tournament date
- Optional start-time label
- Optional timezone label
- Optional prize-pool label
- Image URL
- CTA label and HTTPS URL
- State: `draft` or `archived`
- Creator and last-editor Auth0 subjects
- Created and updated timestamps

The tournament date is the visibility boundary. Public display is eligible through the end of that UTC calendar date and hidden from the start of the following UTC day.

### `tournament_spotlight`

A singleton row points to the active tournament. Replacing this foreign key activates another tournament atomically and guarantees that the public site has at most one spotlight.

### `tournament_versions`

A database trigger records a JSON snapshot after insert and update. Versions include the tournament ID, monotonically increasing version number, actor, action, snapshot, and timestamp. They are accessible only through Supabase/service-role tooling in v1; there is no restore UI.

Hard deletion is not exposed. Managers archive records instead.

## APIs

- `GET /api/tournaments` returns only the currently active, non-archived, non-expired public projection.
- `GET /api/tournaments/manage` returns all tournaments and the active spotlight ID to authorized managers.
- `POST /api/tournaments/manage` creates a draft.
- `PATCH /api/tournaments/manage/:id` updates allowlisted fields with optimistic concurrency based on `updatedAt`.
- `POST /api/tournaments/manage/:id/activate` activates the tournament by replacing the singleton spotlight pointer.
- `POST /api/tournaments/manage/:id/deactivate` clears the spotlight when it references that tournament.
- `POST /api/tournaments/manage/:id/archive` archives the tournament and clears it from the spotlight when necessary.

All manager responses use `Cache-Control: private, no-store`. The active spotlight is loaded server-side into the homepage's initial HTML and held in a short tagged server cache. Tournament edits and spotlight actions invalidate that tag immediately.

## Validation

- Trim strings and enforce conservative maximum lengths.
- Tournament name and date are required.
- Image URL and CTA URL must use `https:`.
- CTA label is required when a CTA URL exists.
- Reject unknown status/attribution/version fields from request bodies.
- Derive creator and editor from the Auth0 session.
- Render descriptions as plain React text; HTML input is not supported.
- Reject stale updates with `409 Conflict`.

## User experience

- Add a conditional “Manage tournaments” item to authenticated navigation, including a mobile-accessible entry.
- `/tournaments/manage` provides:
  - tournament list with Draft, Active, Expired, and Archived indicators;
  - create action;
  - edit form;
  - preview using the same banner component as the homepage;
  - activate, deactivate, and archive controls;
  - clear success, validation, stale-update, and authorization messages.
- Extract the existing banner into a reusable data-driven `TournamentPromo` component.
- Preserve its current responsive position between the header and tab navigation.
- Track CTA clicks dynamically with tournament ID, name, URL, and banner location.

## Acceptance criteria

- Anonymous and unauthorized accounts cannot access tournament drafts or mutation endpoints.
- A manually granted manager can create and edit any tournament.
- Activating one tournament replaces the active spotlight without exposing two banners.
- The homepage never renders more than one tournament.
- The spotlight disappears automatically on the UTC day after the tournament date.
- Archived tournaments remain in the database but cannot be activated or shown publicly.
- Every create/edit/archive change produces a private version snapshot.
- Existing hard-coded tournament content is replaced by API-backed data.
- The UI works on mobile and desktop and uses the existing visual language.
