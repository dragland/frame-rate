# 🎬 Frame Rate

Movie night voting app - ranked choice voting for movie night.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Get TMDB API key:**
   - Sign up at [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
   - Create `.env.local`:
     ```
     TMDB_API_KEY=your_api_key_here
     ```

3. **Run locally:**
   ```bash
   npm run dev
   ```
   → Open [http://localhost:3000](http://localhost:3000)

**Live demo:** [https://frame-rate.onrender.com](https://frame-rate.onrender.com)

## Structure

```
app/
├── api/search/route.ts    # TMDB API proxy (keeps key secure)
├── page.tsx               # Main app (search, lists, drag-drop)
├── layout.tsx             # Root layout
└── globals.css            # Tailwind + custom styles

lib/
└── tmdb.ts                # TMDB types & utilities
```

## Features

- **Search**: TMDB API integration, 5 results per query
- **Lists**: Personal movie lists with drag-and-drop reordering
- **Responsive**: Desktop sidebar, mobile collapsible
- **Secure**: API key stays server-side

## Deploy

**Render:**
- Build: `npm install && npm run build`
- Start: `npm start`
- Add `TMDB_API_KEY` environment variable

**Current**: Single-user experience  
**Next**: Group sessions, voting, Redis 
