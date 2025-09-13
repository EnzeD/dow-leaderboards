# DoW:DE Top-100 Ladder (v2)

## 1) Purpose

Public, mobile-friendly site that shows Top-100 players for any Dawn of War: Definitive Edition leaderboard. Data comes from Relic's public Community API; player display names are enriched via Steam. Site refreshes every 5 minutes. Use community endpoints (not game endpoints).

## 2) What we ship in v1

One page with:

- Dropdown of available leaderboards (live list)
- Search box (client-side filter by player name)
- Sortable table (Rank, Player, Rating, Wins, Losses, Winrate %, Streak)
- "Last updated" timestamp and stale-data banner
- Server cache: ladder payload (5 min), ID→name map (24 h)
- Graceful fallback to last good cache on upstream error

## 3) Data sources (authoritative)

### List leaderboards
```
GET /community/leaderboard/GetAvailableLeaderboards?title=dow1-de
```
Use IDs and names exactly as returned (no hardcoding).

### Get ladder rows (Top-100)
```
GET /community/leaderboard/getLeaderBoard2?title=dow1-de&leaderboard_id=<ID>&start=1&count=100&sortBy=1
```
sortBy=1 sorts by rating. Response contains statGroups (players & aliases) and (per game family) matching stats you join by statgroup id.

### Name enrichment (Steam)
```
GET /community/external/proxysteamuserrequest?title=dow1-de&request=/ISteamUser/GetPlayerSummaries/v0002/&profile_ids=<csv>
```
Map steamResults.response.players[].personaname ⇢ profile_id. If that fails, fall back to GetPersonalStat. Batch requests (≤25 IDs/chunk).

### Personal stats (fallback/joins)
```
GET /community/leaderboard/GetPersonalStat?title=dow1-de&profile_names=["/steam/<id>"]
```
Also works with aliases; response includes statGroups (members → profile_id, alias) and leaderboardStats.

### Rate limit
Community API documented at 50 req/s — keep generous headroom, use chunking & caching.

**Note:** The Steam "Public API" thread links a /game/.../getLeaderBoard example. For this project, use the community endpoints above—they're sessionless and documented; the community thread itself enumerates them for DoW:DE.

## 4) Normalized row contract (what the UI expects)

```typescript
type LadderRow = {
  rank: number
  profileId: string
  playerName: string            // filled from statGroups alias → Steam persona → "Unknown"
  rating: number
  wins: number
  losses: number
  winrate: number               // computed: wins/(wins+losses)*100 with 1 decimal
  streak: number
}
```

## 5) Rules the implementation must follow

- Always pass `title=dow1-de`
- Request exactly `start=1&count=100&sortBy=1` for Top-100 by rating
- Build rows by joining stats to players via `statgroup_id ⇢ statGroups[].id`
- Player name priority:
  1. `statGroups.members[0].alias` →
  2. Steam personaname via proxysteamuserrequest (batched) →
  3. "Unknown"
- Cache: ladder JSON 300s; ID→name 24h. If live fetch fails, serve last cache and mark stale=true
- Respect rate limits (≤ 10 req/s effective for enrichment) and backoff on non-200

## 6) Acceptance criteria

- Default leaderboard renders 100 rows with realistic data (non-zero ratings)
- ≥90% of rows show a non-"Unknown" player name under normal conditions
- Sorting and search are instant (client only)
- "Last updated" within 5 minutes when online; shows stale banner if serving cached stale data
- Dropdown populated from live leaderboard list (not hardcoded)