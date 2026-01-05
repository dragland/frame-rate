# CLAUDE.md

Movie night voting app: nominate films → veto one each → ranked-choice winner.

## Commands

```bash
npm run dev          # Dev server (in-memory)
npm run dev:redis    # Dev with Redis (Docker)
npm run build && npm run lint
```

Env: `TMDB_API_KEY` in `.env.local`. Production needs `REDIS_URL`.

## Critical: Session Mutations

**All mutations MUST use this pattern** (race conditions otherwise):

```typescript
const updated = await atomicSessionUpdate(code, ttl, (session) => {
  // modify session
  return session; // or null to abort
});
await publishSessionUpdate(code, updated);  // SSE broadcast
```

## Phase Flow (Sequential, No Skipping)

```
ranking → locked → vetoing → finalRanking → results
```

Transitions happen automatically when all participants complete their action. Phase order is strict.

## Key Files

| File | Purpose |
|------|---------|
| `lib/redis.ts` | Storage + atomic ops + SSE pub/sub |
| `lib/voting.ts` | Ranked-choice algorithm |
| `lib/types.ts` | `Session`, `VotingPhase`, `Movie` |
| `lib/constants.ts` | TTLs, limits (24h session, 8 users, 2 nominations) |
| `lib/letterboxd-server.ts` | Profile scraping (fragile, multiple regex fallbacks) |
