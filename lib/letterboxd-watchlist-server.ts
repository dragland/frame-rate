/**
 * Server-side Letterboxd watchlist scraping
 * Fetches a user's watchlist as a set of film slugs, so the UI can badge
 * movies that participants want to watch (matched via the film slug already
 * present in each movie's letterboxdRating.filmUrl).
 */

import getRedisClient from './redis';
import { CACHE_CONFIG } from './constants';
import { fetchLetterboxdHtml } from './letterboxd-rating-server';

export interface LetterboxdWatchlist {
  username: string;
  slugs: string[];
  /** True when the watchlist had more pages than we were willing to fetch */
  truncated: boolean;
}

// 28 films per page → 560 films. Anything past that is silently invisible to
// badging, so the result carries `truncated` rather than pretending otherwise.
const MAX_WATCHLIST_PAGES = 20;

// Aggregate budget for one pagination walk. Each page fetch can take up to
// ~25s worst case (direct timeout + Jina fallback), so without a deadline a
// single request could run for minutes and time out at the platform layer.
// Hitting the deadline caches a truncated result — decorative data, and one
// expensive walk per cache TTL is the ceiling we want.
const WALK_BUDGET_MS = 20_000;

// Coalesce concurrent walks for the same username: when a session assembles,
// every client asks for every participant at once, and without this each
// cache miss would trigger its own full pagination walk.
const inFlightWatchlists = new Map<string, Promise<LetterboxdWatchlist>>();

/**
 * Pull film slugs out of a watchlist page. Letterboxd poster markup carries
 * data-film-slug — bare ("the-matrix") in current markup, path-shaped
 * ("/film/the-matrix/") in older markup — with data-target-link as a fallback.
 */
export function extractWatchlistSlugs(html: string): string[] {
  const slugs = new Set<string>();

  for (const match of html.matchAll(/data-film-slug="([^"]+)"/g)) {
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
 * Fetch a user's watchlist slugs, walking pagination until a page comes back
 * empty. Results are cached (CACHE_CONFIG.TTL); a Cloudflare block mid-walk
 * returns what we have WITHOUT caching, so the next request can retry —
 * a partial watchlist cached for 6 hours would silently hide badges.
 */
export async function fetchLetterboxdWatchlist(username: string): Promise<LetterboxdWatchlist> {
  const cleanUsername = username.trim().toLowerCase();

  if (!cleanUsername) {
    return { username: cleanUsername, slugs: [], truncated: false };
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
  const empty: LetterboxdWatchlist = { username: cleanUsername, slugs: [], truncated: false };
  const redis = getRedisClient();
  const cacheKey = `letterboxd:watchlist:v1:${cleanUsername}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const slugs = new Set<string>();
    let truncated = false;
    let blocked = false;
    const startedAt = Date.now();

    for (let page = 1; page <= MAX_WATCHLIST_PAGES; page++) {
      if (page > 1 && Date.now() - startedAt > WALK_BUDGET_MS) {
        truncated = true;
        console.warn(`Letterboxd watchlist walk for ${cleanUsername} hit time budget at page ${page}`);
        break;
      }

      const path = page === 1
        ? `/${cleanUsername}/watchlist/`
        : `/${cleanUsername}/watchlist/page/${page}/`;

      const result = await fetchLetterboxdHtml(path);

      if (result === null) {
        // Blocked/unreachable — keep whatever we already collected
        blocked = true;
        break;
      }

      if (result === 'not-found') {
        // Page 1: no such user or private watchlist. Later pages: walked past
        // the end. Either way we're done.
        break;
      }

      const pageSlugs = extractWatchlistSlugs(result.html);
      if (pageSlugs.length === 0) {
        break;
      }

      pageSlugs.forEach(slug => slugs.add(slug));

      if (page === MAX_WATCHLIST_PAGES) {
        truncated = true;
        console.warn(`Letterboxd watchlist for ${cleanUsername} truncated at ${MAX_WATCHLIST_PAGES} pages`);
      }
    }

    const watchlist: LetterboxdWatchlist = {
      username: cleanUsername,
      slugs: Array.from(slugs),
      truncated,
    };

    if (!blocked) {
      await redis.setex(cacheKey, CACHE_CONFIG.TTL, JSON.stringify(watchlist));
    }

    return watchlist;
  } catch (error) {
    console.error('Failed to fetch Letterboxd watchlist:', error);
    return empty;
  }
}
