# CLAUDE.md

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

Transitions happen automatically when all participants complete their action. Never skip phases.

## Key Patterns

- **Validation in atomic modifiers**: Capture errors in closure variable, return `null` to abort, check after for HTTP status
- **Storage**: `lib/redis.ts` abstracts Redis (prod) / in-memory Map (dev) - auto-detected by `REDIS_URL`
- **SSE race condition**: Subscribe to pub/sub BEFORE fetching state (see `stream/route.ts`)
- **Duplicate nominations**: Same movie from different users → use `nominationId` for vetoes
- **Voting ties**: Random coin flip + UI feedback
- **Letterboxd profile scraping** (`lib/letterboxd-server.ts`): Fragile regex patterns for avatar extraction
- **Letterboxd rating scraping** (`lib/letterboxd-rating-server.ts`): Direct fetch with Jina Reader proxy fallback on Cloudflare; parses `twitter:data2` meta with JSON-LD fallback
