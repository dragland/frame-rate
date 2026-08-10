import { describe, expect, it } from 'vitest';
import { extractWatchlistSlugs } from './letterboxd-watchlist-server';
import { filmSlugFromUrl } from './letterboxd';

describe('letterboxd-watchlist-server', () => {
  describe('extractWatchlistSlugs', () => {
    it('extracts bare slugs from data-film-slug attributes', () => {
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
