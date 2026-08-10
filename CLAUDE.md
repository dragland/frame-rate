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

## Phase Flow

```
ranking → vetoing → finalRanking → results
```

The `ranking` phase is the staging phase where each participant drags their nominations into order. Starting voting locks each participant's top 2 nominations by moving directly to `vetoing`. All later transitions go through `advanceVotingPhaseIfComplete` (lib/voting.ts) — called from the veto, final-movies, and leave routes; `vetoing` skips straight to `results` if ≤1 movie remains after vetoes.

## Key Patterns

- **Validation in atomic modifiers**: Capture errors in closure variable, return `null` to abort, check after for HTTP status
- **Input validation**: `lib/validation.ts` gates every route — codes `[A-Z]{4}`, usernames `[a-z0-9_]{1,32}`, movie payloads shape+size checked
- **Usernames**: always stored lowercase (`normalizeUsername` on every entry point, incl. client localStorage reads) — comparisons are strict equality
- **Leave route**: reassigns host to `participants[0]` if the host left, and re-runs phase advancement (clearing stale `finalMovies`) since a departure changes the pool
- **Storage**: `lib/redis.ts` abstracts Redis (prod) / in-memory Map (dev) - auto-detected by `REDIS_URL`
- **SSE race condition**: Subscribe to pub/sub BEFORE fetching state (see `stream/route.ts`)
- **Duplicate nominations**: Same movie from different users → `nominationId` (`"movieId-username"`, required) is the canonical veto target
- **Voting ties**: Random coin flip + UI feedback
- **Letterboxd profile scraping** (`lib/letterboxd-server.ts`): Fragile regex patterns for avatar extraction
- **Letterboxd rating scraping** (`lib/letterboxd-rating-server.ts`): Direct fetch with Jina Reader proxy fallback on Cloudflare; parses `twitter:data2` meta with JSON-LD fallback

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
