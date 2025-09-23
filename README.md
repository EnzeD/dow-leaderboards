# Dawn of War: Definitive Edition Leaderboards

A modern, mobile-friendly leaderboard website for Dawn of War: Definitive Edition, displaying live rankings and player statistics from Relic's Community API.

Live: https://www.dow-de.com

![Dawn of War: Definitive Edition Leaderboards](./image.png)

## 🚀 Features

- **Live Data**: Real-time leaderboard data from Relic Community API
- **Complete Coverage**: All 37 leaderboards (1v1-4v4 for all factions)
- **Player Search**: Find players across all leaderboards by Steam name or alias
- **Steam Integration**: Enhanced with Steam player names (≥90% success rate)
- **Mobile-Friendly**: Responsive design optimized for all devices
- **Advanced Filtering**: Sort by rank, rating, wins, losses, winrate, and more
- **Flag System**: CSS-based country flags for international players
- **Shareable URLs**: Filters/search/support reflected in the URL; default leaderboards keep a clean root (`/`). Copy-link buttons in the UI.
- **Smarter Search UX**: On leaderboards, no-match searches auto-expand results (top 200 → top 1000) and revert when cleared; suggest profile search if still none.
- **Faction Logos**: Color‑matched icons in Faction columns and search sections for quick visual parsing.

## 🛠 Tech Stack

- **Framework**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS
- **Data Sources**: Relic Community API + Steam API
- **Deployment**: Ready for Vercel/Netlify

## 🏃‍♂️ Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/EnzeD/dow-leaderboards.git
cd dow-leaderboards

# Install dependencies
npm install

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the application.

Production is available at `https://www.dow-de.com`.

### Steam Player Count

The site shows the live Steam player count in the header. It uses Steam’s
`GetNumberOfCurrentPlayers` and defaults to the Dawn of War: Definitive Edition
App ID `3556750` — no configuration required.

If you want to override it for another app, you may set `STEAM_APP_ID_DOW_DE`
in your environment, but this is optional.

### Build for Production

```bash
npm run build
npm start
```

## 🗄 Supabase Seeding

Once your Supabase project is provisioned (migrations + reference seed applied), you can capture an initial snapshot of every Relic leaderboard and populate the `players` table in one pass.

1. Copy `.env.template` to `.env` and fill in `SUPABASE_URL` plus `SUPABASE_SERVICE_ROLE_KEY` (service role key lives in the Supabase dashboard under Project Settings → API).
2. Optional: adjust `LEADERBOARD_SNAPSHOT_MAX` (defaults to 200 to match Relic’s cap), `LEADERBOARD_PAGE_SIZE`, or `LEADERBOARD_SNAPSHOT_SOURCE` to tune batch size/source tagging.
3. Run the seeding script: `npm run seed:leaderboards`

The script pulls every leaderboard directly from the Relic API, inserts/updates matching rows in `leaderboards`, records a snapshot for the current UTC day, and upserts all discovered players (alias + country + last_seen_at) into `players`. It respects Relic's soft rate limits with a small delay between pages; expect the run to take a minute or two for all 37 ladders.

## 🔍 Data Collection

### Player Enrichment
Enhance player data with Steam IDs, levels, XP, and country information.

```bash
# Run enrichment (takes ~20 minutes)
npm run enrich:players

# Monitor progress
npm run monitor:enrichment
```

### Match History Crawling
Collect match histories to build a comprehensive match database.

```bash
# Start crawling
npm run crawl:concurrent    # Fast version (recommended)
# OR
node scripts/crawl-player-matches.mjs  # Slower but stable

# Monitor progress
npm run crawl:watch         # Live updates every 15 seconds
npm run crawl:status        # One-time status check

# Fix stuck jobs
npm run crawl:cleanup
```

#### How crawling works
- Uses a job queue to process players systematically
- Discovers new players from matches automatically
- Respects API rate limits with built-in delays
- Jobs have 5 states: pending → in_progress → done/failed/cooldown

#### Monitor status meanings
- 🟢 **ACTIVE**: Jobs ready to process
- 🟡 **WAITING**: All jobs on cooldown
- ✅ **COMPLETE**: All players processed
- ⚠️ **STUCK**: Run `npm run crawl:cleanup`
- ⏳ **PROCESSING**: Currently working

### Configuration

Configure via `.env` file:

```bash
# Player Enrichment
ENRICH_PLAYER_LIMIT=2000      # Players per batch
ENRICH_CONCURRENCY=10         # Parallel workers

# Match Crawling
CRAWL_COOLDOWN_MINUTES=60     # Time between re-crawling same player
CRAWL_CONCURRENCY=6           # Parallel workers (concurrent version)
CRAWL_EXIT_ON_IDLE=true       # Auto-exit when done

# Database
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_key
```

### Troubleshooting

**Stuck jobs**: Run `npm run crawl:cleanup`
**Connection issues**: Check your `.env` file has correct Supabase credentials
**Slow crawling**: Use `npm run crawl:concurrent` for faster processing

## 🤝 Contributing

We welcome contributions! Here are some ways you can help:

### 🐛 Bug Reports & Feature Requests
- Report bugs via [GitHub Issues](https://github.com/EnzeD/dow-leaderboards/issues)
- Suggest new features or improvements
- Help test the application across different devices

### 💻 Code Contributions

#### Good First Issues
- **UI/UX Improvements**: Better mobile experience, dark/light theme toggle
- **Player Profiles**: Individual player pages with match history
- **Enhanced Search**: Advanced filters, faction-specific searches
- **Performance**: Caching improvements, optimization
- **Accessibility**: Screen reader support, keyboard navigation

#### Getting Started
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes following the existing code style
4. Test your changes locally
5. Commit with descriptive messages
6. Push and create a Pull Request

### 🎯 Development Guidelines

#### Code Style
- Follow existing TypeScript/React patterns
- Use Tailwind CSS for styling
- Keep components modular and reusable
- Add proper error handling

#### API Integration
- All data comes from Relic Community API (`https://dow-api.reliclink.com`)
- Always pass `title=dow1-de` parameter
- Respect rate limits (≤50 req/s, implemented as ≤8 req/s)
- Handle API failures gracefully

#### Key Files
- `src/lib/relic.ts` - Core API functions
- `src/app/api/` - Next.js API routes
- `src/app/page.tsx` - Main UI components

## 📊 Project Status

**✅ Current Features**
- Fully functional prototype with live data
- Complete UI with sorting, filtering, search
- Steam name enrichment working
- Mobile-responsive design
- Rate limiting and error handling
- Basic 'exact-match' search

**🚧 Potential Enhancements**
- Player profile pages
- Historical data tracking
- Advanced caching (Redis/KV)
- Performance analytics
- Match history integration

## 🔧 Architecture

### Data Flow
1. **Leaderboards**: Cached for 24h from `GetAvailableLeaderboards`
2. **Ladder Data**: Cached for 5 minutes from `getLeaderBoard2` (Top-200)
3. **Steam Names**: Batch resolution via `proxysteamuserrequest`

### API Endpoints
- `/api/leaderboards` — Available leaderboard list
- `/api/cache/leaderboard/[id]` — Cached leaderboard rows (default 200)
- `/api/cache/leaderboard/[id]/[limit]` — Extended rows (e.g., 1000)
- `/api/cache/combined-1v1` and `/api/cache/combined-1v1/[limit]` — Combined 1v1 across factions
- `/api/cache/player/by-alias/[alias]` — Player profile + stats + recent matches

## 📝 License

This project is open source and available under the MIT License.

## 🙏 Acknowledgments

- **Relic Entertainment** - For Dawn of War: Definitive Edition and Community API
- **Community** - All the players who make the leaderboards competitive
- **Contributors** - Everyone who helps improve this project

---

**Ready to contribute?** Check out our [GitHub Issues](https://github.com/EnzeD/dow-leaderboards/issues) or start with the codebase exploration!
