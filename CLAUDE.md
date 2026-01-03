# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Development server (in-memory sessions)
npm run dev:redis        # Development with Redis via Docker
npm run build            # Production build
npm run lint             # ESLint
```

Requires `TMDB_API_KEY` in `.env.local`. Production requires `REDIS_URL`.

## Architecture

Frame Rate is a movie night voting app where friends nominate films, veto one each, then use ranked-choice voting to pick a winner.

### Voting Flow (Sequential Phases)

```
ranking → locked → vetoing → finalRanking → results
```

1. **ranking**: Users nominate 2+ movies (only top 2 count), can reorder
2. **locked**: Host locks nominations, no more changes
3. **vetoing**: Each participant vetoes exactly one nomination
4. **finalRanking**: Rank remaining movies for final vote
5. **results**: Ranked-choice winner calculated and displayed

Phase transitions happen automatically when all participants complete their action.

### Storage Layer (`lib/redis.ts`)

Dual-mode storage with identical interface:
- **Production**: Redis with `WATCH/MULTI/EXEC` for atomic updates
- **Development**: In-memory Map with mutex locks

Key pattern for mutations:
```typescript
const updated = await atomicSessionUpdate(code, ttl, (session) => {
  // modify session
  return session; // or null to abort
});
await publishSessionUpdate(code, updated);
```

All session mutations must use `atomicSessionUpdate()` to prevent race conditions, followed by `publishSessionUpdate()` for SSE broadcast.

### Real-time Updates

Single shared Redis subscriber fans out to unlimited SSE clients via EventEmitter:
- `subscribeToSession(code)` - subscribe once per channel
- `publishSessionUpdate(code, session)` - broadcast after mutations
- `getSessionEmitter()` - attach SSE response listeners

SSE endpoint: `app/api/sessions/[code]/stream/route.ts`

### Ranked-Choice Voting (`lib/voting.ts`)

`calculateRankedChoiceWinner()` implements instant-runoff:
1. Count first-choice votes from each participant's `finalMovies` (or `movies` fallback)
2. If any movie has majority (>50%), it wins
3. Otherwise, eliminate movie with fewest votes (random tiebreaker)
4. Repeat until winner

### External APIs

- **TMDB**: Movie search, details, posters (`lib/tmdb.ts`)
- **Letterboxd**: Profile validation and ratings via HTML scraping (`lib/letterboxd-server.ts`)

Letterboxd scraping is fragile by nature - uses multiple regex patterns for robustness.

### Key Constants (`lib/constants.ts`)

- Session TTL: 24 hours
- Max participants: 8
- Max nominations per user: 2
- Session codes: 4 uppercase letters
- Cache TTL: 6 hours (profile pics, movie data)

### Types (`lib/types.ts`)

Core types: `Session`, `SessionParticipant`, `VotingPhase`, `VotingResults`, `Movie`
