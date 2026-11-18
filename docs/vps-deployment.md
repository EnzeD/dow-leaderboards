# DoW Leaderboards on the VPS

The frontend runs as a standalone Next.js container on the existing Caddy network. The app uses the live data gateway at `https://data.dow-de.com` for PostgREST and replays. Auth0 and Stripe continue to use the production hostname, `https://www.dow-de.com`.

## Prepare a release

1. Run the repository's type, lint, and build checks. Use the same Node.js major as the Docker image.
2. Keep configuration in private files on the VPS. The build file is dotenv and contains the production `NEXT_PUBLIC_*` settings, including `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Public settings are compiled into the browser bundle. The runtime file uses one literal `KEY=value` per line, without shell quotes. Include the production Supabase, Auth0, and Stripe settings from the current deployment. Use `APP_BASE_URL=https://www.dow-de.com` and set `ANALYTICS_ADMIN_AUTH0_SUB` to the owner's `user.sub` from `/api/auth/session` while they are signed in.
3. Apply `supabase/migrations/0055_product_analytics_summary.sql` and `0056_site_analytics_overview.sql` to the VPS database. They add service-role-only aggregates over existing product events.
4. Build and start the candidate on the VPS from the reviewed source.

```sh
export DOW_IMAGE="dow-leaderboards:$(git rev-parse --short HEAD)"
export DOW_RUNTIME_ENV=/opt/dow-leaderboards-web/runtime.env
dow_build_env=/opt/dow-leaderboards-web/build.env
docker build --build-arg "DOW_BUILD_ENV_SHA=$(sha256sum "$dow_build_env" | cut -d ' ' -f1)" \
  --secret "id=public_env,src=$dow_build_env" -t "$DOW_IMAGE" .
docker compose -p dow-leaderboards-web -f deploy/compose.yaml up -d --wait
curl -fsS http://127.0.0.1:13002/favicon.ico -o /dev/null
```

Use a distinct image tag for each release and retain the previous image for rollback. While rehearsing, the candidate is accessible through the VPS loopback or the Docker proxy network. Use the canonical hostname for production OAuth and Stripe URL checks.

## Switch the frontend

1. Check the candidate through Caddy with a local domain override before changing public DNS. Verify the leaderboard, search, stats, replay downloads and uploads, Auth0 sign-in and sign-out, tournament management, Stripe signature validation and Pro account flows, and both owner and non-owner access to `/admin`. Check the last successful runs of the VPS data timers.
2. Save the existing OVH DNS records and shared Caddy configuration. Add the vhosts from `deploy/dow-de.caddy` to the existing Caddy configuration and validate it before reloading. Use a public certificate for both hostnames on the VPS before directing traffic there. DNS-01 validation can complete while the current A and CNAME records route to Vercel. If Caddy loads a certificate issued by another ACME client, configure renewal for that certificate.
3. At the agreed switch, update the apex A record and replace the `www` CNAME with an A record pointing to the VPS. Preserve the data gateway and other DNS records. Check HTTPS, the apex redirect, application flows, and server logs from the public network.
4. Keep the Vercel deployment available during verification and DNS propagation. To roll back public traffic, restore the original OVH records for the apex and `www`. The two frontends share the same data gateway, so a frontend rollback does not require a database restore.
5. Disconnect Vercel after public traffic and the Stripe webhook have been verified on the VPS.

On November 18, 2026, OVH DNS returned the records below with a one-hour TTL. Refresh this snapshot before switching.

| Host | Type | Vercel rollback target |
| --- | --- | --- |
| `dow-de.com` | A | `216.198.79.1` |
| `www.dow-de.com` | CNAME | `b645e7ccb26b0198.vercel-dns-017.com.` |

The VPS target address is `51.178.86.32`.

The owner can open `/admin` after signing in with the allowlisted account. It shows 7 or 30 UTC calendar days, including the current partial day, and compares totals with the preceding period through the same time of day. Browser sessions use the existing tab session IDs. Bounce rate is the share of sessions with one tracked view and zero feature interactions in the selected interval. Acquisition and browser breakdowns use the first tracked view per session in each period.

For countries, download and decompress a current [DB-IP Country Lite MMDB](https://db-ip.com/db/lite.php) onto the VPS. Set `DOW_ANALYTICS_COUNTRY_DB` to its absolute path and add `-f deploy/analytics-country.compose.yaml` after `-f deploy/compose.yaml` when starting the app. Country lookup uses the address supplied by Caddy and stores only the country code in the analytics event. The Country card reports its coverage as new events arrive. Restart the container after updating the database file.
