# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Next.js 14 + TypeScript project that creates a public, mobile-friendly leaderboard site for Dawn of War: Definitive Edition. The application displays Top-100 players for any DoW:DE leaderboard with data from Relic's Community API, enriched with Steam player names.

## Architecture

### Data Flow
1. **API Routes**: Two main endpoints handle all data operations
   - `/api/leaderboards` - Returns available leaderboard list (cached 24h)
   - `/api/ladder?leaderboard_id=<id>` - Returns Top-100 ladder data with player enrichment (cached 5min)

2. **Data Sources**: All data comes from Relic's Community API at `https://dow-api.reliclink.com`
   - `GetAvailableLeaderboards` - Lists all available leaderboards
   - `getLeaderBoard2` - Gets Top-100 players with stats
   - `proxysteamuserrequest` - Enriches player names via Steam API

3. **Player Name Resolution**: Three-tier priority system
   - Primary: `statGroups.members[0].alias` from ladder data
   - Secondary: Steam `personaname` via batch API calls (≤25 IDs per chunk)
   - Fallback: "Unknown" for unresolvable players

### Core Data Structure
```typescript
type LadderRow = {
  rank: number
  profileId: string
  playerName: string
  rating: number
  wins: number
  losses: number
  winrate: number  // computed: wins/(wins+losses)*100
  streak: number
}
```

## Implementation Details

### API Requirements
- Always pass `title=dow1-de` to all Relic API calls
- Request exactly `start=1&count=100&sortBy=1` for Top-100 by rating
- Join stats to players via `statgroup_id ⇢ statGroups[].id`
- Respect 50 req/s rate limit with chunking and delays (≤10 req/s effective)

### Caching Strategy
- Leaderboard list: 24 hours (relatively static)
- Ladder data: 5 minutes (frequent updates during active play)
- Steam name mappings: 24 hours (player names change rarely)
- Graceful degradation: serve stale cache on upstream failures

### Reference Implementation
The `IMPLEMENTATION.MD` file contains drop-in TypeScript code for:
- `lib/relic.ts` - Core API functions (`fetchLeaderboards`, `fetchTop100`, `resolveNames`)
- `app/api/leaderboards/route.ts` - Leaderboard list endpoint
- `app/api/ladder/route.ts` - Ladder data endpoint with name enrichment

### UI Requirements
- SSR pattern: page makes single JSON call to internal API
- Client-side search and sorting (instant response)
- Dropdown populated from live leaderboard data (not hardcoded)
- Stale data banner when serving cached data on upstream errors
- "Unknown" player names styled as dimmed but still searchable

## Key Constraints

### Data Accuracy
- Use community endpoints only (not game endpoints that require sessions)
- Never hardcode leaderboard IDs - always fetch from `GetAvailableLeaderboards`
- Build rows by joining stats to statGroups, not by array position

### Performance
- Target ≥90% non-"Unknown" player names under normal conditions
- Batch Steam API calls in chunks of 25 IDs max
- Add 120ms delays between enrichment batches for rate limiting
- Cache aggressively but mark stale data appropriately

### Error Handling
- Fallback to last good cache on upstream API failures
- Return 502 status with empty rows array if no cache available
- Log upstream status, fetch durations, and enrichment success rates