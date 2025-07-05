# 🎞️ Frame Rate
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Now%20Showing-4CAF50?style=for-the-badge&logoColor=white)](https://frame-rate.onrender.com)

Movie night voting app with ranked choice voting and group watch parties
<div align="center">
  <img src="https://github.com/user-attachments/assets/b2bbcda9-761e-4f34-ba5c-8d1c85afa713" width="15%" />
  <img src="https://github.com/user-attachments/assets/2bbd44ce-9522-482b-b1e1-5aeb26d6d060" width="15%" />
  <img src="https://github.com/user-attachments/assets/c4c05cc6-1190-4d1c-8027-38b4158d3dfe" width="15%" />
  <img src="https://github.com/user-attachments/assets/a2492296-78fa-4c0b-9b6b-23a2614a043f" width="15%" />
  <img src="https://github.com/user-attachments/assets/9440fc3f-bb87-4fd7-ad26-d1d04ffadb9a" width="15%" />
  <img src="https://github.com/user-attachments/assets/ee20a779-6c93-4442-b09a-30a1cc2a8b63" width="15%" />
</div>

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

1. Add Redis service in Render dashboard
2. Set environment variables:  
   ```
   TMDB_API_KEY=your_key_here
   REDIS_URL=your_render_redis_url
   ```

Deploy: `npm ci && npm run build && npm start`

## Project Structure

```
app/
├── components/        # React UI components
├── api/sessions/      # Session management APIs
├── api/search/        # TMDB movie search
└── [code]/            # Dynamic session pages
lib/
├── voting.ts          # Ranked choice voting algo
├── session.ts         # Session utilities
├── tmdb.ts            # Movie database integration
└── redis.ts           # Storage (Redis/in-memory)
```

## Tech Stack

- **Framework**: Next.js 14 + TypeScript
- **Styling**: Tailwind CSS  
- **Session Storage**: Redis (prod) / In-memory (dev)
- **APIs**: TMDB + Letterboxd scraping
- **Deployment**: Render (or any Node.js host)
