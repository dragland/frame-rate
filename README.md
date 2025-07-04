# 🎞️ Frame Rate

Movie night voting app with ranked choice voting and group watch parties.
   →  [frame-rate.onrender.com](https://frame-rate.onrender.com)

## How It Works

- Sign in with `Letterboxd` & create watch party
- Friends join session with 4-letter code
- Everyone nominates 2+ films with TMDB search
- Nominations are locked in & everyone casts 1 veto
- Final nominations are ranked again to pick the winner


## Quick Start

**Prerequisites**: [TMDB API key](https://www.themoviedb.org/settings/api)

1. **Setup**:
   ```bash
   npm install
   echo "TMDB_API_KEY=your_key_here" > .env.local
   ```

2. **Run**:
   ```bash
   npm run dev              # Development (in-memory sessions)
   npm run dev:redis        # Development with Redis (Docker)
   ```
   
   → Open [localhost:3000](http://localhost:3000)

**Storage**: Development uses in-memory sessions (reset on restart). Production requires Redis.

## Production

**Redis is required for production** (group sessions are stored in Redis):

**Option 1: Free Redis (Recommended)**
1. Sign up at [upstash.com](https://upstash.com) (500K commands/month free)
2. Create Redis database → Copy connection URL
3. Set environment variables:
   ```
   TMDB_API_KEY=your_key_here
   REDIS_URL=your_upstash_redis_url
   ```

**Option 2: Render Redis (~$7/month)**
1. Add Redis service in Render dashboard
2. Set environment variables:  
   ```
   TMDB_API_KEY=your_key_here
   REDIS_URL=your_render_redis_url
   ```

Deploy: `npm ci && npm run build && npm start`

## Tech Stack

- **Framework**: Next.js 14 + TypeScript
- **Styling**: Tailwind CSS  
- **Session Storage**: Redis (prod) / In-memory (dev)
- **APIs**: TMDB + Letterboxd scraping
- **Deployment**: Render (or any Node.js host)

