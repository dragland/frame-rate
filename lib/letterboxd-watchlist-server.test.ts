import { describe, expect, it } from 'vitest';
import { extractWatchlistSlugs, extractWatchlistPageCount } from './letterboxd-watchlist-server';
import { filmSlugFromUrl } from './letterboxd';

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
