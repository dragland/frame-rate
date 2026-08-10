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
  const empty: LetterboxdWatchlist = { username: cleanUsername, slugs: [], truncated: false };

  if (!cleanUsername) {
    return empty;
  }

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

    for (let page = 1; page <= MAX_WATCHLIST_PAGES; page++) {
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
