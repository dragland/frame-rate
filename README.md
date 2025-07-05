# 🎞️ Frame Rate
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Now%20Showing-4CAF50?style=for-the-badge&logoColor=white)](https://frame-rate.onrender.com)

Movie night voting app with ranked choice voting and group watch parties

<div align="center">
  <img src="https://github.com/user-attachments/assets/52ba2235-006d-4a58-a7cf-8fcbe7d8f801" width="15%" />
  <img src="https://github.com/user-attachments/assets/6a124378-ef99-4516-b664-2df812a4683e" width="15%" />
  <img src="https://github.com/user-attachments/assets/da4babc2-ad84-496c-873f-191d5d89bce7" width="15%" />
  <img src="https://github.com/user-attachments/assets/758bb4aa-b108-47c8-90de-00422ed07a80" width="15%" />
  <img src="https://github.com/user-attachments/assets/dc5567bc-34bd-4c06-a5c6-66f112893890" width="15%" />
  <img src="https://github.com/user-attachments/assets/ccd4e047-24c1-4a56-8f3b-9dffb3bdb3f7" width="15%" />
</div>

## How It Works

- Sign in with `Letterboxd` & create watch party
- Friends join session with 4-letter code
- Everyone nominates 2+ films with TMDB search
- Nominations are locked in & everyone casts 1 veto
- Final nominations are ranked again to pick the winner

## Project Structure

```
app/
├── components/          # React UI components
├── api/sessions/        # Session management APIs
├── api/search/         # TMDB movie search
└── [code]/             # Dynamic session pages

lib/
├── voting.ts           # Ranked choice voting algo
├── session.ts          # Session utilities
├── tmdb.ts            # Movie database integration
└── redis.ts           # Storage (Redis/in-memory)
```

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

## Tech Stack

- **Framework**: Next.js 14 + TypeScript
- **Styling**: Tailwind CSS  
- **Session Storage**: Redis (prod) / In-memory (dev)
- **APIs**: TMDB + Letterboxd scraping
- **Deployment**: Render (or any Node.js host)
