# Tech Plan & Implementation Guide (v2)

## A) Stack

- Next.js 14 + TypeScript (App Router)
- Minimal UI (Tailwind or Mantine)
- API routes for `/api/leaderboards` and `/api/ladder`
- Caching: in-memory per instance or KV (preferred) with TTLs above
- Build for SSR (page makes one JSON call to our API). Coh3-stats uses similar SSR pattern successfully.

## B) Endpoints we call (final)

```
GET https://dow-api.reliclink.com/community/leaderboard/GetAvailableLeaderboards?title=dow1-de
GET https://dow-api.reliclink.com/community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=<ID>&start=1&count=100&sortBy=1
GET https://dow-api.reliclink.com/community/external/proxysteamuserrequest?title=dow1-de&request=/ISteamUser/GetPlayerSummaries/v0002/&profile_ids=<csv-of-ids>
```

**Fallback:**
```
GET https://dow-api.reliclink.com/community/leaderboard/GetPersonalStat?title=dow1-de&profile_names=["/steam/<id>",...]
```

These are the same families used across Relic titles and publicly documented by the community spec.

## C) Parsing & join logic (rock-solid)

`getLeaderBoard2` response contains player containers (`statGroups`) with `members[].profile_id`, `members[].alias`. Stats are provided in the same payload family and/or obtainable via GetPersonalStat; join on `statgroup_id ⇢ statGroups[].id` to produce ranked rows (COH/AoE endpoints expose that mapping pattern).

Compute winrate defensively:

```javascript
const winrate = (wins + losses) ? +( (wins / (wins + losses)) * 100 ).toFixed(1) : 0
```

## D) Name enrichment (no more "Unknown")

- Collect profile IDs lacking alias
- Call proxysteamuserrequest in chunks of ≤25 profile_ids
- Map `steamResults.response.players[].personaname ↔ Relic profile_id` (API returns both Steam and Relic data in one payload). Cache for 24h
- If a player still has no persona (privacy, missing link), keep "Unknown" and do not loop further
- Respect 50 rps guide; space enrichment calls (e.g., 100ms delay between chunks) or use a single chunk for Top-100

## E) API routes (exact contracts)

### GET /api/leaderboards

Returns a slim list for the dropdown.

```json
{
  "items": [{ "id": 1, "name": "1v1_chaos_marine_race" }, { "id": 7, "name": "1v1_overall" }],
  "lastUpdated": "2025-09-13T16:10:00Z"
}
```

**Implementation:** proxy GetAvailableLeaderboards, map leaderboards[] to {id,name}, cache 24h.

### GET /api/ladder?leaderboard_id=<id>

Normalized rows (see PRD §4) + freshness flags.

```json
{
  "leaderboardId": 1,
  "lastUpdated": "2025-09-13T16:12:26Z",
  "stale": false,
  "rows": [ /* 100 LadderRow objects */ ]
}
```

## F) Reference code (drop-in, Node/TS)

```typescript
// lib/relic.ts
const BASE = "https://dow-api.reliclink.com";

type RawGroup = { id: number, members: Array<{ profile_id: number, alias?: string }> };
type RawStat = { statgroup_id: number, rank: number, rating: number, wins: number, losses: number, streak: number };

export type LadderRow = {
  rank: number; profileId: string; playerName: string;
  rating: number; wins: number; losses: number; winrate: number; streak: number;
};

export async function fetchLeaderboards() {
  const url = `${BASE}/community/leaderboard/GetAvailableLeaderboards?title=dow1-de`;
  const data = await fetch(url, { next: { revalidate: 86400 } }).then(r => r.json());
  const items = (data?.leaderboards ?? []).map((l: any) => ({ id: l.id, name: l.name }));
  return { items, lastUpdated: new Date().toISOString() };
}

export async function fetchTop100(leaderboardId: number) {
  const url = `${BASE}/community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=${leaderboardId}&start=1&count=100&sortBy=1`;
  const data = await fetch(url, { cache: "no-store" }).then(r => r.json());

  const groups: RawGroup[] = data?.statGroups ?? [];
  // Some games include a parallel "leaderboardStats" array. Prefer it when present.
  const stats: RawStat[] =
    data?.leaderboardStats ??
    (data?.items ?? []) // fallback if endpoint shape varies
      .map((it: any) => ({
        statgroup_id: it?.statgroup?.id ?? it.statgroup_id,
        rank: it.rank ?? it.position,
        rating: it.rating ?? it.elo ?? it.score,
        wins: it.wins ?? it.win_count ?? 0,
        losses: it.losses ?? it.loss_count ?? 0,
        streak: it.streak ?? 0
      }));

  const groupsById = new Map(groups.map(g => [g.id, g]));
  const rows: LadderRow[] = stats
    .filter(s => s?.statgroup_id)
    .map(s => {
      const group = groupsById.get(s.statgroup_id);
      const member = group?.members?.[0];
      const profileId = String(member?.profile_id ?? "");
      const alias = member?.alias?.trim();
      const winrate = (s.wins + s.losses) ? +( (s.wins / (s.wins + s.losses)) * 100 ).toFixed(1) : 0;
      return {
        rank: s.rank ?? 0,
        profileId,
        playerName: alias || "",  // fill later
        rating: s.rating ?? 0,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        winrate,
        streak: s.streak ?? 0,
      };
    }).filter(r => r.profileId);

  return rows;
}

export async function resolveNames(profileIds: string[]): Promise<Record<string, string>> {
  // Chunk to avoid very long URLs and respect rate limits.
  const uniq = [...new Set(profileIds)];
  const out: Record<string, string> = {};
  const size = 25;

  for (let i = 0; i < uniq.length; i += size) {
    const ids = uniq.slice(i, i + size);
    const url = `${BASE}/community/external/proxysteamuserrequest?title=dow1-de&request=/ISteamUser/GetPlayerSummaries/v0002/&profile_ids=${ids.join(",")}`;
    const data = await fetch(encodeURI(url)).then(r => r.json());
    const players = data?.steamResults?.response?.players ?? [];
    // Some variants also include avatars[] with profile_id→alias; prefer personaname
    for (const p of players) {
      if (p?.relic_profile_id && p?.personaname) out[String(p.relic_profile_id)] = p.personaname;
    }
    await new Promise(r => setTimeout(r, 120)); // soft throttle (≤ ~8 req/s)
  }
  return out;
}
```

### Route handlers (App Router)

```typescript
// app/api/leaderboards/route.ts
import { fetchLeaderboards } from "@/lib/relic";
export async function GET() {
  try { 
    return Response.json(await fetchLeaderboards(), { 
      headers: { "Cache-Control": "s-maxage=3600" } 
    }); 
  }
  catch (e) { 
    return new Response(
      JSON.stringify({ 
        items: [], 
        lastUpdated: new Date().toISOString(), 
        error: "fetch_failed" 
      }), 
      { status: 502 }
    ); 
  }
}

// app/api/ladder/route.ts
import { fetchTop100, resolveNames } from "@/lib/relic";
export async function GET(req: Request) {
  const id = Number(new URL(req.url).searchParams.get("leaderboard_id") ?? 1);
  try {
    const rows = await fetchTop100(id);
    const missing = rows.filter(r => !r.playerName).map(r => r.profileId);
    const map = missing.length ? await resolveNames(missing) : {};
    for (const r of rows) r.playerName = r.playerName || map[r.profileId] || "Unknown";
    return Response.json({ 
      leaderboardId: id, 
      lastUpdated: new Date().toISOString(), 
      stale: false, 
      rows 
    });
  } catch {
    // TODO: serve cached copy here; for brevity return 502
    return new Response(
      JSON.stringify({ 
        leaderboardId: id, 
        lastUpdated: new Date().toISOString(), 
        stale: true, 
        rows: [] 
      }), 
      { status: 502 }
    );
  }
}
```

## G) UI specifics

- Populate dropdown from `/api/leaderboards` at load; persist selection in querystring
- Table with sticky headers, numeric sort (rating/wins/losses/streak), text sort (name)
- Show "Unknown" names in a dimmed style; still searchable after enrichment

## H) Ops / monitoring

- **Log:** upstream status, fetch durations, rows count, enrichment hits/misses
- **Health:** `/api/ladder?leaderboard_id=<id>` returns `rows.length===100`
- **Alarms:** if ladder fetch errors > N in 10 minutes

## I) Quick sanity cURL (dev can run)

```bash
# Leaderboards list
curl -s 'https://dow-api.reliclink.com/community/leaderboard/GetAvailableLeaderboards?title=dow1-de' | jq '.leaderboards[0:5]'

# One ladder
curl -s 'https://dow-api.reliclink.com/community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=1&start=1&count=100&sortBy=1' | jq '.statGroups[0]'
```

(Params & response shapes documented in the community spec.)

## J) Known pitfalls (and fixes)

- **Empty rows / wrong endpoint:** Use community getLeaderBoard2, not `/game/.../getLeaderBoard` that often expects session ids
- **"Unknown" names:** Many ladder rows lack aliases; resolve via proxysteamuserrequest. Keep fallback "Unknown"
- **Hardcoded IDs:** Don't; fetch from GetAvailableLeaderboards and use returned id/name
- **Rate limits:** Batch enrichment, add tiny delays, cache ID→name for 24 h