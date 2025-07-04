# 🎞️ Frame Rate
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Now%20Showing-4CAF50?style=for-the-badge&logoColor=white)](https://frame-rate.onrender.com)

Movie night voting app with ranked choice voting and group watch parties

<div align="center">
  <img src="https://github.com/user-attachments/assets/52ba2235-006d-4a58-a7cf-8fcbe7d8f801" width="15%" />
  <img src="https://github.com/user-attachments/assets/284c18ab-83b2-4e53-9adf-667ac748f761" width="15%" />
  <img src="https://github.com/user-attachments/assets/ab736c39-a997-4de0-a065-3747e486c397" width="15%" />
  <img src="https://github.com/user-attachments/assets/0f3548ff-52dc-4df7-aeb5-23e63943b4a6" width="15%" />
  <img src="https://github.com/user-attachments/assets/70c4311f-5cea-4387-a366-a22fb26727ef" width="15%" />
  <img src="https://github.com/user-attachments/assets/4e40a948-55ea-4447-91cd-84eadd20e330" width="15%" />
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

## Tech Stack

- **Framework**: Next.js 14 + TypeScript
- **Styling**: Tailwind CSS  
- **Session Storage**: Redis (prod) / In-memory (dev)
- **APIs**: TMDB + Letterboxd scraping
- **Deployment**: Render (or any Node.js host)

