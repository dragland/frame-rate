# 🎞️ Frame Rate

Movie night voting app with ranked choice voting and group watch parties.

## Core Features

- **Movie Search**: TMDB integration with Letterboxd ratings
- **Ranked Lists**: Drag & drop movie preferences
- **Watch Parties**: Host/join sessions with 4-letter codes
- **Mobile Responsive**: Touch-friendly interface

## Quick Start

1. Get TMDB API key from [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)

2. Create `.env.local`:
   ```
   TMDB_API_KEY=your_key_here
   ```

3. Run:
   ```bash
   npm install
   npm run dev
   ```
   → Open [localhost:3000](http://localhost:3000)

## How It Works

**Start a Movie Night**: Enter letterboxd username and start building lists
**Join a Watch Party**: Host creates session code, others join to build lists
**Vote & Enjoy**: Lock in ranked preferences (group voting coming soon)

## Implementation

```
app/
├── api/search/route.ts    # TMDB proxy + Letterboxd scraping
├── page.tsx               # Main app with session state
├── layout.tsx             # Root layout
└── globals.css            # Tailwind styles

lib/
├── tmdb.ts                # Movie search & types
└── letterboxd.ts          # Rating scraper
```

Built with Next.js + Tailwind. Deploy to Render with `TMDB_API_KEY`.
