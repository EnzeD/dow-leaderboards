import { auth0, auth0Configured } from "@/lib/auth0";
import { isPresenceId, PRESENCE_WINDOW_MS } from "@/lib/analytics/presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cacheHeaders = { "Cache-Control": "private, no-store" };
const maxActiveBrowsers = 20_000;
const lastSeen = new Map<string, number>();

function removeExpired(now: number) {
  const entries = lastSeen.entries();
  for (let entry = entries.next(); !entry.done; entry = entries.next()) {
    const [id, seenAt] = entry.value;
    if (now - seenAt < PRESENCE_WINDOW_MS) break;
    lastSeen.delete(id);
  }
}

export async function POST(request: Request) {
  const appUrl = process.env.APP_BASE_URL ?? process.env.AUTH0_BASE_URL ?? request.url;
  if (request.headers.get("origin") !== new URL(appUrl).origin) {
    return new Response(null, { status: 403, headers: cacheHeaders });
  }
  if (request.headers.get("content-length") !== "36") {
    return new Response(null, { status: 400, headers: cacheHeaders });
  }

  const id = await request.text();
  if (!isPresenceId(id)) {
    return new Response(null, { status: 400, headers: cacheHeaders });
  }

  const now = performance.now();
  removeExpired(now);
  // Reinserting puts the refreshed browser at the newest end of the map.
  const alreadyPresent = lastSeen.delete(id);
  if (!alreadyPresent && lastSeen.size >= maxActiveBrowsers) {
    return new Response(null, { status: 503, headers: cacheHeaders });
  }
  lastSeen.set(id, now);

  return new Response(null, { status: 204, headers: cacheHeaders });
}

export async function GET() {
  const owner = process.env.ANALYTICS_ADMIN_AUTH0_SUB?.trim();
  if (!auth0Configured || !owner) {
    return new Response(null, { status: 404, headers: cacheHeaders });
  }
  const session = await auth0.getSession();
  if (!session || session.user.sub !== owner) {
    return new Response(null, { status: 404, headers: cacheHeaders });
  }

  removeExpired(performance.now());
  return Response.json({ count: lastSeen.size }, { headers: cacheHeaders });
}
