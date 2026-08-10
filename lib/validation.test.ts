import { describe, expect, it } from 'vitest';
import {
  isMovieArrayPayload,
  isPositiveInteger,
  isValidSessionCode,
  isValidUsername,
  normalizeSessionCode,
  normalizeUsername,
  sanitizeMovies,
} from './validation';
import { Movie } from './tmdb';

describe('validation.ts', () => {
  it('normalizes and validates session codes', () => {
    expect(normalizeSessionCode(' abcd ')).toBe('ABCD');
    expect(isValidSessionCode('abcd')).toBe(true);
    expect(isValidSessionCode('abc')).toBe(false);
    expect(isValidSessionCode('abc1')).toBe(false);
  });

  it('normalizes and validates usernames', () => {
    expect(normalizeUsername(' Alice_1 ')).toBe('alice_1');
    expect(isValidUsername('Alice_1')).toBe(true);
    expect(isValidUsername('alice-1')).toBe(false);
    expect(isValidUsername('')).toBe(false);
  });

  it('validates positive integers', () => {
    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(1.5)).toBe(false);
    expect(isPositiveInteger('1')).toBe(false);
  });

  it('validates movie arrays by required fields', () => {
    expect(isMovieArrayPayload([{ id: 1, title: 'Movie' }])).toBe(true);
    expect(isMovieArrayPayload([{ id: 1, title: '' }])).toBe(false);
    expect(isMovieArrayPayload([{ id: '1', title: 'Movie' }])).toBe(false);
    expect(isMovieArrayPayload({ id: 1, title: 'Movie' })).toBe(false);
  });

  it('rejects reserved usernames that poison object-keyed maps', () => {
    expect(isValidUsername('__proto__')).toBe(false);
    expect(isValidUsername('constructor')).toBe(false);
    expect(isValidUsername('prototype')).toBe(false);
    expect(isValidUsername('proto_fan')).toBe(true);
  });

  describe('sanitizeMovies', () => {
    const base = {
      id: 1,
      title: 'Heat',
      overview: 'Cops and robbers',
      poster_path: '/heat.jpg',
      backdrop_path: null,
      release_date: '1995-12-15',
      vote_average: 8.2,
      vote_count: 1000,
      genre_ids: [80, 18],
    } as Movie;

    it('keeps well-formed fields intact', () => {
      const [movie] = sanitizeMovies([{
        ...base,
        runtime: 170,
        director: 'Michael Mann',
        letterboxdRating: { rating: 4.3, ratingText: '4.3 out of 5', filmUrl: 'https://letterboxd.com/film/heat-1995/', tmdbId: 949 },
      }]);

      expect(movie.title).toBe('Heat');
      expect(movie.director).toBe('Michael Mann');
      expect(movie.letterboxdRating?.filmUrl).toBe('https://letterboxd.com/film/heat-1995/');
    });

    it('drops letterboxd ratings whose filmUrl is off-site or a javascript: URI', () => {
      const hostile = sanitizeMovies([
        { ...base, letterboxdRating: { rating: 4, ratingText: 'x', filmUrl: 'javascript:alert(1)', tmdbId: 1 } },
        { ...base, letterboxdRating: { rating: 4, ratingText: 'x', filmUrl: 'https://evil.example/phish', tmdbId: 1 } },
      ]);

      expect(hostile[0].letterboxdRating).toBeNull();
      expect(hostile[1].letterboxdRating).toBeNull();
    });

    it('strips unknown fields and clamps oversized ones', () => {
      const [movie] = sanitizeMovies([{
        ...base,
        overview: 'x'.repeat(50_000),
        smuggled: 'payload',
      } as unknown as Movie]);

      expect('smuggled' in movie).toBe(false);
      expect(movie.overview).toBe('');
    });
  });
});
