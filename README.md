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

### Build for Production

```bash
npm run build
npm start
```

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
2. **Ladder Data**: Cached for 30min from `getLeaderBoard2` (Top-200)
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
