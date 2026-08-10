# CLAUDE.md

## Critical: Session Mutations

**All mutations MUST use this pattern** (race conditions otherwise):

```typescript
const updated = await atomicSessionUpdate(code, ttl, (session) => {
  // modify session
  return session; // null to abort, or 'delete' to atomically remove the session
});
await publishSessionUpdate(code, updated);  // SSE broadcast
```

## Phase Flow

```
ranking → vetoing → finalRanking → results
```

The `ranking` phase is the staging phase where each participant drags their nominations into order. Starting voting freezes each participant's top 2 into `session.nominations` (`lockNominations`) and moves to `vetoing`. All later transitions go through `advanceVotingPhaseIfComplete` (lib/voting.ts) — called from the veto and final-movies routes only; `vetoing` skips straight to `results` if ≤1 movie remains after vetoes.

## Key Patterns

- **Validation in atomic modifiers**: Capture errors in closure variable, return `null` to abort, check after for HTTP status
- **Input validation**: `lib/validation.ts` gates every route — codes `[A-Z]{4}`, usernames `[a-z0-9_]{1,32}`, movie payloads shape+size checked
- **Usernames**: always stored lowercase (`normalizeUsername` on every entry point, incl. client localStorage reads) — comparisons are strict equality
- **Frozen pool**: `session.nominations`, `session.vetoes`, and `session.finalRankings` live on the session, never on participants — leaving/rejoining can't change the pool or voting state, and phase completion is judged against the pool's eligible voters, so presence neither blocks nor fast-forwards phases (leave only reassigns host to `participants[0]` if needed)
- **Rejoin eligibility**: mid-vote joins allowed only for usernames with nominations in the frozen pool (`isEligibleVoter`); their movies are restored from it
- **Storage**: `lib/redis.ts` abstracts Redis (prod) / in-memory Map (dev) - auto-detected by `REDIS_URL`
- **SSE race condition**: Subscribe to pub/sub BEFORE fetching state (see `stream/route.ts`)
- **Duplicate nominations**: Same movie from different users → `nominationId` (`"movieId-username"`, required) is the canonical veto target
- **Voting ties**: Random coin flip + UI feedback
- **Letterboxd profile scraping** (`lib/letterboxd-server.ts`): direct fetch → RSS + activity-page fallback (avatar matched by display name, which can differ from username); blocked lookups are never cached; cache key `letterboxd:profile:v2:*` (v1 wrongly cached Cloudflare blocks as `exists:false`)
- **Letterboxd rating scraping** (`lib/letterboxd-rating-server.ts`): Direct fetch with Jina Reader proxy fallback on Cloudflare; parses `twitter:data2` meta with JSON-LD fallback
- **Letterboxd watchlist scraping** (`lib/letterboxd-watchlist-server.ts`): all-or-nothing — parallel-batch walks every page and verifies collected slugs against page 1's declared film count, because partial badges read as bugs. Empty is cached (`letterboxd:watchlist:v2:*`; v1 could cache partials) only for real answers — no such user/hidden watchlist, >100 pages; transient failures (block, parser miss, count mismatch, budget overrun) return empty uncached so the next request retries. Movies match client-side via `filmSlugFromUrl` against `letterboxdRating.filmUrl` — no per-movie requests. Route is session-gated (username must be participant/eligible voter of `code`) since a cold walk can cost ~100 upstream fetches

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
