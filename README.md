# 🎞️ Frame Rate

Movie night voting app with ranked choice voting and group watch parties.
   →  [frame-rate.onrender.com](https://frame-rate.onrender.com)

## Core Features

- **Movie Search**: TMDB integration with Letterboxd ratings
- **Ranked Lists**: Drag & drop movie preferences
- **Watch Parties**: Host/join sessions with 4-letter codes
- **Mobile Responsive**: Touch-friendly interface

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

## How It Works

**🎬 Host**: Create session → Share 4-letter code  
**🎉 Join**: Enter code → Add username → Start ranking  
**📝 Rank**: Search movies → Drag to reorder → Auto-sync with group  
**🗳️ Vote**: Lock preferences → See results (voting logic coming soon!)

## Tech Stack

- **Framework**: Next.js 14 + TypeScript
- **Styling**: Tailwind CSS  
- **Session Storage**: Redis (prod) / In-memory (dev)
- **APIs**: TMDB + Letterboxd scraping
- **Deployment**: Render (or any Node.js host)

