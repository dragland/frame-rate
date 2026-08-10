/**
 * Server-side Letterboxd watchlist scraping
 * Fetches a user's watchlist as a set of film slugs, so the UI can badge
 * movies that participants want to watch (matched via the film slug already
 * present in each movie's letterboxdRating.filmUrl).
 *
 * Semantics are ALL-OR-NOTHING: a walk either captures the complete
 * watchlist or returns empty — partial results would surface as false
 * negatives ("that film IS on my watchlist"), which read as bugs.
 */

import getRedisClient from './redis';
import { CACHE_CONFIG } from './constants';
import { fetchLetterboxdHtml } from './letterboxd-rating-server';

export interface LetterboxdWatchlist {
  username: string;
  /** Complete slug list, or empty when the watchlist is empty/unavailable */
  slugs: string[];
}

// 28 films per page → 2800 films. Bigger watchlists are treated as
// unavailable (cached, so they aren't re-walked every request).
const MAX_WATCHLIST_PAGES = 100;

// Pages are fetched in parallel batches: Letterboxd's Cloudflare blocking is
// fingerprint-based, not rate-based, so serial fetching buys no safety and
// costs wall-clock. 6 keeps one walk from looking like a flood.
const PAGE_FETCH_CONCURRENCY = 6;

// Aggregate budget for one walk; on overrun the result is unavailable
// (uncached, so a faster attempt later can succeed).
const WALK_BUDGET_MS = 20_000;

// Coalesce concurrent walks for the same username: when a session assembles,
// every client asks for every participant at once, and without this each
// cache miss would trigger its own full pagination walk.
const inFlightWatchlists = new Map<string, Promise<LetterboxdWatchlist>>();

/**
 * Pull film slugs out of a watchlist page. Current Letterboxd markup carries
 * data-item-slug (bare slug); older markup used data-film-slug (bare or
 * path-shaped), with data-target-link as a last resort.
 */
export function extractWatchlistSlugs(html: string): string[] {
  const slugs = new Set<string>();

  for (const match of html.matchAll(/data-(?:item|film)-slug="([^"]+)"/g)) {
    const slug = match[1].replace(/^\/+|\/+$/g, '').replace(/^film\//, '');
    if (slug) slugs.add(slug);
  }

  if (slugs.size === 0) {
    for (const match of html.matchAll(/data-target-link="\/film\/([^/"]+)\//g)) {
      slugs.add(match[1]);
    }
  }

  return Array.from(slugs);
}

/**
 * Total page count from page 1's pagination links (absent → single page).
 */
export function extractWatchlistPageCount(html: string): number {
  let last = 1;
  for (const match of html.matchAll(/\/watchlist\/page\/(\d+)/g)) {
    last = Math.max(last, Number.parseInt(match[1], 10));
  }
  return last;
}

/**
 * The film count Letterboxd declares on page 1 ("2,150 films"), or null when
 * the element is missing. This is the all-or-nothing ground truth: a walk
 * whose collected slugs don't match it is discarded rather than cached.
 */
export function extractWatchlistFilmCount(html: string): number | null {
  const match = html.match(/js-watchlist-count[^>]*>([\d,]+)/);
  if (!match) return null;
  return Number.parseInt(match[1].replace(/,/g, ''), 10);
}

export async function fetchLetterboxdWatchlist(username: string): Promise<LetterboxdWatchlist> {
  const cleanUsername = username.trim().toLowerCase();

  if (!cleanUsername) {
    return { username: cleanUsername, slugs: [] };
  }

  const inFlight = inFlightWatchlists.get(cleanUsername);
  if (inFlight) {
    return inFlight;
  }

  const walk = walkWatchlist(cleanUsername).finally(() => {
    inFlightWatchlists.delete(cleanUsername);
  });
  inFlightWatchlists.set(cleanUsername, walk);
  return walk;
}

async function walkWatchlist(cleanUsername: string): Promise<LetterboxdWatchlist> {
  const empty: LetterboxdWatchlist = { username: cleanUsername, slugs: [] };
  const redis = getRedisClient();
  // v2: v1 could cache partial (truncated/blocked-mid-walk) watchlists
  const cacheKey = `letterboxd:watchlist:v2:${cleanUsername}`;

  const cacheAndReturn = async (watchlist: LetterboxdWatchlist): Promise<LetterboxdWatchlist> => {
    try {
      await redis.setex(cacheKey, CACHE_CONFIG.TTL, JSON.stringify(watchlist));
    } catch (error) {
      // A failed cache write shouldn't discard a successfully assembled walk
      console.warn('Letterboxd watchlist cache write failed:', error);
    }
    return watchlist;
  };

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const startedAt = Date.now();

    const first = await fetchLetterboxdHtml(`/${cleanUsername}/watchlist/`);
    if (first === null) {
      // Blocked/unreachable — unknown, not empty: don't cache, retry later
      return empty;
    }
    if (first === 'not-found') {
      // No such user (or hidden watchlist) — a real answer, cacheable
      return await cacheAndReturn(empty);
    }

    const slugs = new Set<string>(extractWatchlistSlugs(first.html));
    const pageCount = extractWatchlistPageCount(first.html);
    const declaredCount = extractWatchlistFilmCount(first.html);

    if (slugs.size === 0 && (pageCount > 1 || (declaredCount ?? 0) > 0)) {
      // The page says films exist but the parser found none — markup changed
      // again. Unavailable (uncached) beats silently caching "empty"; the
      // declaredCount check catches this for single-page watchlists too.
      console.warn(`Letterboxd watchlist parser found 0 slugs on page 1 for ${cleanUsername} (${pageCount} pages, ${declaredCount ?? '?'} films declared)`);
      return empty;
    }

    if (pageCount > MAX_WATCHLIST_PAGES) {
      console.warn(`Letterboxd watchlist for ${cleanUsername} has ${pageCount} pages (max ${MAX_WATCHLIST_PAGES}) — treating as unavailable`);
      return await cacheAndReturn(empty);
    }

    // Fetch remaining pages in parallel batches; ANY failure (block, 404,
    // parser miss, time budget) makes the whole walk unavailable — never
    // serve a partial watchlist.
    for (let batchStart = 2; batchStart <= pageCount; batchStart += PAGE_FETCH_CONCURRENCY) {
      if (Date.now() - startedAt > WALK_BUDGET_MS) {
        console.warn(`Letterboxd watchlist walk for ${cleanUsername} hit time budget at page ${batchStart}`);
        return empty;
      }

      const batchEnd = Math.min(batchStart + PAGE_FETCH_CONCURRENCY - 1, pageCount);
      const pages = await Promise.all(
        Array.from({ length: batchEnd - batchStart + 1 }, (_, i) =>
          fetchLetterboxdHtml(`/${cleanUsername}/watchlist/page/${batchStart + i}/`)
        )
      );

      for (const page of pages) {
        if (page === null || page === 'not-found') {
          return empty;
        }
        const pageSlugs = extractWatchlistSlugs(page.html);
        if (pageSlugs.length === 0) {
          return empty;
        }
        pageSlugs.forEach(slug => slugs.add(slug));
      }
    }

    if (declaredCount !== null && slugs.size !== declaredCount) {
      // All-or-nothing invariant: collected slugs must match the declared
      // count, else pagination lied (shrink race, hidden pages, parser gap) —
      // uncached so the next attempt sees a consistent snapshot
      console.warn(`Letterboxd watchlist for ${cleanUsername}: collected ${slugs.size} slugs but page declares ${declaredCount} films — discarding walk`);
      return empty;
    }

    return await cacheAndReturn({ username: cleanUsername, slugs: Array.from(slugs) });
  } catch (error) {
    console.error('Failed to fetch Letterboxd watchlist:', error);
    return empty;
  }
}
