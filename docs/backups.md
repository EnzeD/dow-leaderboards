# Backups (matches + match participants)

This repo includes a helper script to export **only** the `public.matches` and `public.match_participants` tables from Supabase using `psql` + `COPY` (works even when Supabase Postgres is newer than your local `pg_dump`).

## Prereqs

- None up-front: the script will download and vendor the needed Postgres client binaries into `.local/` (no sudo) on first run.

## Configure

Set `SUPABASE_DB_URL` to your Supabase **direct** Postgres connection string (from Supabase Dashboard → Database → Connect).

Example:

```bash
export SUPABASE_DB_URL='postgresql://postgres:<DB_PASSWORD>@db.<PROJECT_REF>.supabase.co:5432/postgres'
```

Note: If your password contains special characters, you may need to URL/percent-encode it for `psql`.

You can also put `SUPABASE_DB_URL=` in `.env.local` (gitignored); the script loads both `.env` and `.env.local`.

Quick encoder (password-only):

```bash
node -e "console.log(encodeURIComponent(process.argv[1]))" 'p@ss:word!'
```

## Run

```bash
npm run backup:match-tables
```

Outputs a timestamped dump under `backups/` (default: `backups/matches_match_participants_<timestamp>.sql.gz`).

If you see `Network is unreachable` and an IPv6 address in the error, your network likely has no IPv6 route. In that case, use the Supabase Dashboard → Database → Connect → **Session pooler** connection string instead of the direct `db.<ref>.supabase.co` host.

Optional flags:

```bash
npm run backup:match-tables -- --use-copy
```

To verify what would run (without connecting):

```bash
npm run backup:match-tables -- --dry-run
```
