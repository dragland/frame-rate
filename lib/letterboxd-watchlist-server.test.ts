import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  extractWatchlistSlugs,
  extractWatchlistPageCount,
  extractWatchlistFilmCount,
  fetchLetterboxdWatchlist,
} from './letterboxd-watchlist-server';
import { fetchLetterboxdHtml } from './letterboxd-rating-server';
import { filmSlugFromUrl } from './letterboxd';

vi.mock('./letterboxd-rating-server', () => ({
  fetchLetterboxdHtml: vi.fn(),
}));

const mockFetchHtml = vi.mocked(fetchLetterboxdHtml);

// Attribute shapes lifted from a real watchlist page (Aug 2026 markup)
const REAL_POSTER_MARKUP = [
  '<div class="poster film-poster" data-item-slug="i-want-your-sex" data-target-link="/film/i-want-your-sex/" data-item-link="/film/i-want-your-sex/"></div>',
  '<div class="poster film-poster" data-item-slug="her-private-hell-2026" data-target-link="/film/her-private-hell-2026/"></div>',
  '<div class="poster film-poster" data-item-slug="love-massacre" data-target-link="/film/love-massacre/"></div>',
].join('');

describe('letterboxd-watchlist-server', () => {
  describe('extractWatchlistSlugs', () => {
    it('extracts slugs from current data-item-slug markup', () => {
      expect(extractWatchlistSlugs(REAL_POSTER_MARKUP)).toEqual([
        'i-want-your-sex',
        'her-private-hell-2026',
        'love-massacre',
      ]);
    });

    it('extracts bare slugs from legacy data-film-slug attributes', () => {
      const html = [
        '<div class="poster film-poster" data-film-slug="the-matrix"></div>',
        '<div class="poster film-poster" data-film-slug="dune-part-two"></div>',
      ].join('');

      expect(extractWatchlistSlugs(html)).toEqual(['the-matrix', 'dune-part-two']);
    });

    it('normalizes path-shaped data-film-slug values from older markup', () => {
      const html = '<div data-film-slug="/film/the-matrix/"></div>';

      expect(extractWatchlistSlugs(html)).toEqual(['the-matrix']);
    });

    it('falls back to data-target-link when no data-film-slug exists', () => {
      const html = '<div data-target-link="/film/eraserhead/"></div>';

      expect(extractWatchlistSlugs(html)).toEqual(['eraserhead']);
    });

    it('deduplicates repeated slugs', () => {
      const html = [
        '<div data-film-slug="the-matrix"></div>',
        '<div data-film-slug="the-matrix"></div>',
      ].join('');

      expect(extractWatchlistSlugs(html)).toEqual(['the-matrix']);
    });

    it('returns an empty array for pages without posters', () => {
      expect(extractWatchlistSlugs('<html><body>This watchlist is empty</body></html>')).toEqual([]);
    });
  });

  describe('extractWatchlistPageCount', () => {
    it('finds the last page from pagination links', () => {
      const html = [
        '<a href="/dammitdavy/watchlist/page/2/">2</a>',
        '<a href="/dammitdavy/watchlist/page/3/">3</a>',
        '<a href="/dammitdavy/watchlist/page/77/">77</a>',
      ].join('');

      expect(extractWatchlistPageCount(html)).toBe(77);
    });

    it('returns 1 when there is no pagination', () => {
      expect(extractWatchlistPageCount(REAL_POSTER_MARKUP)).toBe(1);
    });
  });

  describe('extractWatchlistFilmCount', () => {
    it('parses the declared count from real markup', () => {
      expect(extractWatchlistFilmCount('<span class="js-watchlist-count">2,150&nbsp;films</span>')).toBe(2150);
    });

    it('returns null when the count element is missing', () => {
      expect(extractWatchlistFilmCount(REAL_POSTER_MARKUP)).toBeNull();
    });
  });

  describe('fetchLetterboxdWatchlist (all-or-nothing walk)', () => {
    const poster = (slug: string) => `<div data-item-slug="${slug}"></div>`;
    const countEl = (n: number) => `<span class="js-watchlist-count">${n.toLocaleString('en-US')}&nbsp;films</span>`;
    const pageLink = (user: string, n: number) => `<a href="/${user}/watchlist/page/${n}/">${n}</a>`;

    beforeEach(() => {
      // In-memory redis fallback needs dev mode; unique usernames per test
      // keep the shared memory store from cross-contaminating cache checks
      vi.stubEnv('NODE_ENV', 'development');
      mockFetchHtml.mockReset();
    });

    it('caches a complete multi-page walk and serves the cache on repeat', async () => {
      const user = 'walk_success_user';
      mockFetchHtml.mockImplementation(async (path: string) => {
        if (path === `/${user}/watchlist/`) {
          return { html: countEl(4) + pageLink(user, 2) + poster('a') + poster('b'), url: '' };
        }
        return { html: poster('c') + poster('d'), url: '' };
      });

      const first = await fetchLetterboxdWatchlist(user);
      expect(first.slugs.sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(mockFetchHtml).toHaveBeenCalledTimes(2);

      const second = await fetchLetterboxdWatchlist(user);
      expect(second.slugs.sort()).toEqual(['a', 'b', 'c', 'd']);
      expect(mockFetchHtml).toHaveBeenCalledTimes(2); // cache hit, no refetch
    });

    it('discards the whole walk uncached when a later page is blocked', async () => {
      const user = 'walk_blocked_user';
      mockFetchHtml.mockImplementation(async (path: string) => {
        if (path === `/${user}/watchlist/`) {
          return { html: countEl(4) + pageLink(user, 2) + poster('a') + poster('b'), url: '' };
        }
        return null; // page 2 blocked
      });

      expect((await fetchLetterboxdWatchlist(user)).slugs).toEqual([]);
      const callsAfterFirst = mockFetchHtml.mock.calls.length;

      // Uncached → a second attempt walks again
      await fetchLetterboxdWatchlist(user);
      expect(mockFetchHtml.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('discards the walk uncached when slugs mismatch the declared count', async () => {
      const user = 'walk_mismatch_user';
      mockFetchHtml.mockImplementation(async () => ({
        // Declares 5 films but only 2 posters parse — e.g. partial markup drift
        html: countEl(5) + poster('a') + poster('b'),
        url: '',
      }));

      expect((await fetchLetterboxdWatchlist(user)).slugs).toEqual([]);
      const callsAfterFirst = mockFetchHtml.mock.calls.length;
      await fetchLetterboxdWatchlist(user);
      expect(mockFetchHtml.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('treats a declared-count-with-zero-slugs page as a parser miss, uncached', async () => {
      const user = 'walk_parsermiss_user';
      // Single-page watchlist whose poster markup the parser no longer matches
      mockFetchHtml.mockImplementation(async () => ({
        html: countEl(3) + '<div data-future-slug="unknown-markup"></div>',
        url: '',
      }));

      expect((await fetchLetterboxdWatchlist(user)).slugs).toEqual([]);
      const callsAfterFirst = mockFetchHtml.mock.calls.length;
      await fetchLetterboxdWatchlist(user);
      expect(mockFetchHtml.mock.calls.length).toBeGreaterThan(callsAfterFirst);
    });

    it('caches not-found as a real empty answer', async () => {
      const user = 'walk_notfound_user';
      mockFetchHtml.mockResolvedValue('not-found');

      expect((await fetchLetterboxdWatchlist(user)).slugs).toEqual([]);
      expect(mockFetchHtml).toHaveBeenCalledTimes(1);

      await fetchLetterboxdWatchlist(user);
      expect(mockFetchHtml).toHaveBeenCalledTimes(1); // cached, no refetch
    });

    it('coalesces concurrent walks for the same username', async () => {
      const user = 'walk_concurrent_user';
      mockFetchHtml.mockImplementation(async () => ({
        html: countEl(1) + poster('only-film'),
        url: '',
      }));

      const [a, b] = await Promise.all([
        fetchLetterboxdWatchlist(user),
        fetchLetterboxdWatchlist(user),
      ]);
      expect(a.slugs).toEqual(['only-film']);
      expect(b.slugs).toEqual(['only-film']);
      expect(mockFetchHtml).toHaveBeenCalledTimes(1);
    });
  });

  describe('filmSlugFromUrl', () => {
    it('extracts the slug from a canonical film URL', () => {
      expect(filmSlugFromUrl('https://letterboxd.com/film/the-matrix/')).toBe('the-matrix');
    });

    it('handles URLs without a trailing slash', () => {
      expect(filmSlugFromUrl('https://letterboxd.com/film/the-matrix')).toBe('the-matrix');
    });

    it('returns null for non-film URLs', () => {
      expect(filmSlugFromUrl('https://letterboxd.com/tmdb/550/')).toBeNull();
    });

    it('returns null for undefined input', () => {
      expect(filmSlugFromUrl(undefined)).toBeNull();
    });
  });
});
