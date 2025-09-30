# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A **production Next.js 14 + TypeScript application** that creates a public, mobile-friendly leaderboard site for Dawn of War: Definitive Edition. Live data from Relic's Community API is enriched with Steam player names and stored in Supabase for advanced features like player profiles, match history, and replay uploads.

**Status**: ✅ **Production site deployed** at https://www.dow-de.com

## Architecture

### Tech Stack
- **Framework**: Next.js 14 with TypeScript
- **Database**: Supabase (PostgreSQL with real-time subscriptions)
- **Styling**: Tailwind CSS
- **APIs**: Relic Community API + Steam API
- **Deployment**: Vercel
- **Storage**: Supabase Storage (replay files)

### Core Features

1. **Leaderboards** (`/`)
   - All 37 faction-specific leaderboards (1v1-4v4)
   - Combined 1v1 cross-faction rankings
   - Real-time sortable tables with search
   - Extended views (200/1000 players)
   - Rank delta tracking (24h history)

2. **Player Profiles** (`/profile/[profileId]`)
   - Comprehensive stats across all factions/modes
   - XP levels (calculated client-side from XP curve)
   - Recent match history
   - Rank history charts
   - Steam profile integration

3. **Replay System** (Replays Tab)
   - Upload `.rec` replay files (50MB limit)
   - Download community replays
   - Automatic parsing and metadata extraction
   - Player matching to database profiles
   - Rate limiting (20 uploads/hour per IP)
   - Profanity filtering on descriptions

4. **Player Search**
   - Autocomplete search across all players
   - Fuzzy matching via Supabase full-text search
   - Direct profile navigation
   - Country flag display

5. **Advanced Statistics Teaser** (Premium Feature Mockup)
   - Modal UI showcasing upcoming premium features
   - Price point survey ($2.99/month vs $4.99/month)
   - Email collection for launch notification
   - Lead capture in `premium_interest_leads` table
   - Toggleable via `NEXT_PUBLIC_ENABLE_PREMIUM_TEASER` env var
   - **Not yet implemented** - mockup only for market validation

6. **Data Collection Scripts**
   - `seed:leaderboards` - Initial snapshot of all leaderboards
   - `enrich:players` - Steam ID/level/XP enrichment
   - `crawl:concurrent` - Match history collection
   - `crawl:watch` - Progress monitoring
   - `crawl:cleanup` - Stuck job recovery

### Data Sources

**Relic Community API** (`https://dow-api.reliclink.com`)
- `GetAvailableLeaderboards` - 37 leaderboards (cached 24h)
- `getLeaderBoard2` - Player rankings (cached 5 min)
- `proxysteamuserrequest` - Steam name resolution

**Supabase Database**
- `players` - All discovered players with enrichment
- `leaderboards` - Metadata for 37 ladders
- `leaderboard_snapshots` - Daily rank history
- `matches` - Match history with player performance
- `replays` - Uploaded replay metadata
- `replay_player_links` - Match replays to profiles
- `premium_interest_leads` - Market research for premium tier

### Core Data Structures

```typescript
// Ladder row (API + enrichment)
type LadderRow = {
  rank: number
  profileId: string
  playerName: string
  rating: number
  wins: number
  losses: number
  winrate: number  // (wins / (wins + losses)) * 100
  streak: number
  country?: string
  lastMatchDate?: Date
  faction?: string
  level?: number
  rankDelta?: number | null  // 24h change
  originalRank?: number      // for multi-faction views
  leaderboardId?: number
}

// Player (database)
type Player = {
  profile_id: string
  current_alias: string | null
  country: string | null
  steam_id64: string | null
  level: number | null
  xp: number | null
  first_seen_at: string
  last_seen_at: string
}
```

## Implementation Details

### API Routes

**Leaderboards**
- `/api/leaderboards` - Available leaderboards (24h cache)
- `/api/cache/leaderboard/[id]` - Top-200 ladder (5 min cache)
- `/api/cache/leaderboard/[id]/[limit]` - Extended ladder up to 1000
- `/api/cache/combined-1v1` - Combined 1v1 deduplicated by player
- `/api/cache/combined-1v1/[limit]` - Extended combined (up to 500/faction)
- `/api/cache/combined-1v1-multi` - All faction placements (players may appear multiple times)
- `/api/cache/combined-1v1-multi/[limit]` - Extended multi-entry view

**Players**
- `/api/players/search` - Autocomplete search via Supabase
- `/api/players/profile` - Profile + stats + recent matches
- `/api/cache/player/by-alias/[alias]` - Player lookup by exact alias

**Replays**
- `/api/replays` - GET: list replays, POST: upload replay
- Handles file parsing, player matching, storage upload

**Other**
- `/api/steam/players` - Current player count (cached from Supabase edge function)
- `/api/log-favorite` - Analytics logging for favorite leaderboards
- `/api/premium-interest` - Premium feature interest tracking (advanced stats teaser)

### Key Files

**Core Logic**
- `src/lib/relic.ts` - Relic API wrapper with retry logic
- `src/lib/supabase.ts` - Supabase client setup
- `src/lib/xp-levels.ts` - XP to level calculation (fixes API bug)
- `src/lib/rank-history.ts` - Rank delta computation
- `src/lib/replay-player-matching.ts` - Replay parsing + player matching
- `src/lib/mapMetadata.ts` - Map names/metadata

**UI Components**
- `src/app/page.tsx` - Main leaderboard view (large file ~42k tokens)
- `src/app/profile/[profileId]/page.tsx` - Player profile
- `src/app/_components/ReplaysTab.tsx` - Replay upload/download UI
- `src/components/AutocompleteSearch.tsx` - Player search widget
- `src/components/ClickablePlayer.tsx` - Player name links

**Scripts** (see `scripts/`)
- Data seeding, enrichment, crawling utilities
- All use `.env` for Supabase credentials

### Caching Strategy

- **Leaderboard list**: 24h (`force-cache`)
- **Ladder data**: 5 min (`revalidate: 300` for cached routes)
- **Player profiles**: Real-time from Supabase
- **Steam names**: 120ms throttle between batch calls (25 IDs/chunk)

### Rate Limiting

- **Relic API**: Soft limit ≤8 req/s (50 req/s max)
- **Replay uploads**: 20/hour per IP (hashed for privacy)
- **Download tracking**: Deduplicated by IP per replay

## Key Constraints

### Data Accuracy
- Always pass `title=dow1-de` to Relic API
- Join stats to statGroups by `statgroup_id`, not by array position
- Use community endpoints only (no game endpoints requiring sessions)
- Never hardcode leaderboard IDs - fetch from `GetAvailableLeaderboards`

### Performance
- Name resolution: ≥90% success rate via Steam API
- Response times: Sub-second for Top-200 with enrichment
- Batch processing: Chunked to respect rate limits
- Extended views (1000 players): ~3-5 seconds

### Error Handling
- API failures: Return 502 with error message
- Missing data: Graceful fallback to "Unknown" for unresolved players
- Responsive UI: Loading states, error messages, stale data indicators

## Development Commands

```bash
# Development
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run typecheck    # TypeScript validation
```

## Testing Before Deployment

**Always run TypeScript checks before deploying:**
```bash
npm run typecheck
```

This catches type errors that would cause build failures on Vercel.

## Environment Variables

Required for full functionality:
```bash
# Supabase (public - for client-side)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Supabase (server-side - for scripts/admin routes)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Feature flags
NEXT_PUBLIC_ENABLE_PREMIUM_TEASER=false  # Enable advanced statistics teaser modal
```

## Project Status

### Completed Features ✅
- Full leaderboard system with 37 ladders
- Combined 1v1 cross-faction rankings (deduplicated + multi-entry views)
- Player profiles with comprehensive stats
- Match history tracking
- Replay upload/download system
- Player search with autocomplete
- Rank delta tracking (24h history)
- XP level calculation
- Steam integration (player count badge, profile links)
- Rate limiting and profanity filtering
- Responsive mobile design
- Country flags
- Faction logos
- Advanced statistics teaser/mockup (market validation)

### Architecture Notes
- Large UI file (`page.tsx` ~42k tokens) - use offset/limit when reading
- Supabase migrations in `supabase/migrations/`
- Edge function for Steam player count (`supabase/functions/steam-player-count/`)
- All dates stored as ISO strings or Unix timestamps
- Profile IDs are strings (Relic API returns numbers but we stringify)

### Known Quirks
- Relic API returns `level: 1` for all players (bug) - we compute from XP locally
- Steam name resolution ~90% success (some profiles private/missing)
- Combined 1v1 offers two views: deduplicated (best faction) and multi-entry (all factions)
- Replay parsing requires temp file creation (Node.js buffer → file → parser)