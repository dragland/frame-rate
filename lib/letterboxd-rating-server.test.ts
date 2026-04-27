import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractLetterboxdFilmUrl, extractLetterboxdRating, fetchLetterboxdRating } from './letterboxd-rating-server';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('letterboxd-rating-server', () => {
  describe('extractLetterboxdRating', () => {
    it('extracts the rating from twitter:data2 metadata', () => {
      const html = '<meta name="twitter:label2" content="Average rating"><meta name="twitter:data2" content="4.27 out of 5">';

      expect(extractLetterboxdRating(html)).toEqual({
        rating: 4.27,
        ratingText: '4.27 out of 5',
      });
    });

    it('extracts the rating when meta attributes are reversed', () => {
      const html = '<meta content="3.8 out of 5" name="twitter:data2">';

      expect(extractLetterboxdRating(html)).toEqual({
        rating: 3.8,
        ratingText: '3.8 out of 5',
      });
    });

    it('falls back to JSON-LD aggregateRating metadata', () => {
      const html = '{"aggregateRating":{"bestRating":5,"reviewCount":709213,"@type":"aggregateRating","ratingValue":4.27}}';

      expect(extractLetterboxdRating(html)).toEqual({
        rating: 4.27,
        ratingText: '4.27 out of 5',
      });
    });

    it('returns null when a rating cannot be found', () => {
      expect(extractLetterboxdRating('<html></html>')).toBeNull();
    });
  });

  describe('extractLetterboxdFilmUrl', () => {
    it('extracts the canonical film URL', () => {
      const html = '<link rel="canonical" href="https://letterboxd.com/film/fight-club/">';

      expect(extractLetterboxdFilmUrl(html, 'https://letterboxd.com/tmdb/550/')).toBe('https://letterboxd.com/film/fight-club/');
    });

    it('normalizes relative canonical URLs', () => {
      const html = '<link rel="canonical" href="/film/fight-club/">';

      expect(extractLetterboxdFilmUrl(html, 'https://letterboxd.com/tmdb/550/')).toBe('https://letterboxd.com/film/fight-club/');
    });

    it('uses the fallback URL when no canonical URL exists', () => {
      expect(extractLetterboxdFilmUrl('<html></html>', 'https://letterboxd.com/tmdb/550/')).toBe('https://letterboxd.com/tmdb/550/');
    });
  });

  describe('fetchLetterboxdRating', () => {
    it('falls back to the reader proxy when direct Letterboxd fetching fails', async () => {
      const html = [
        '<link rel="canonical" href="https://letterboxd.com/film/fight-club/">',
        '<meta name="twitter:data2" content="4.27 out of 5">',
      ].join('');
      const fetchMock = vi.spyOn(globalThis, 'fetch')
        .mockRejectedValueOnce(new Error('blocked'))
        .mockResolvedValueOnce(new Response(html, { status: 200 }));

      await expect(fetchLetterboxdRating('550')).resolves.toEqual({
        rating: 4.27,
        ratingText: '4.27 out of 5',
        filmUrl: 'https://letterboxd.com/film/fight-club/',
        tmdbId: 550,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[1][0]).toBe('https://r.jina.ai/https://letterboxd.com/tmdb/550/');
    });
  });
});
