import { Movie } from './tmdb';
import { LetterboxdRating } from './letterboxd';

export const SESSION_CODE_PATTERN = /^[A-Z]{4}$/;
export const USERNAME_PATTERN = /^[a-z0-9_]{1,32}$/;

// These pass the pattern but poison `in`/property access on the JSON-parsed
// objects that vetoes and finalRankings are keyed by
const RESERVED_USERNAMES = new Set(['__proto__', 'constructor', 'prototype']);

export const normalizeSessionCode = (code: string): string => {
  return code.trim().toUpperCase();
};

export const normalizeUsername = (username: string): string => {
  return username.trim().toLowerCase();
};

export const isValidSessionCode = (code: string): boolean => {
  return SESSION_CODE_PATTERN.test(normalizeSessionCode(code));
};

export const isValidUsername = (username: string): boolean => {
  const normalized = normalizeUsername(username);
  return USERNAME_PATTERN.test(normalized) && !RESERVED_USERNAMES.has(normalized);
};

export const isPositiveInteger = (value: unknown): value is number => {
  return Number.isInteger(value) && (value as number) > 0;
};

// Caps keep hostile payloads from bloating the session blob and SSE fan-out
export const MAX_MOVIE_LIST_LENGTH = 50;
export const MAX_MOVIE_TITLE_LENGTH = 500;

export const isMoviePayload = (value: unknown): value is Movie => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const movie = value as Partial<Movie>;

  return isPositiveInteger(movie.id) &&
    typeof movie.title === 'string' &&
    movie.title.trim().length > 0 &&
    movie.title.length <= MAX_MOVIE_TITLE_LENGTH;
};

export const isMovieArrayPayload = (value: unknown): value is Movie[] => {
  return Array.isArray(value) &&
    value.length <= MAX_MOVIE_LIST_LENGTH &&
    value.every(isMoviePayload);
};

const isBoundedString = (value: unknown, max: number): value is string => {
  return typeof value === 'string' && value.length <= max;
};

const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

const sanitizeLetterboxdRating = (value: unknown): LetterboxdRating | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const rating = value as Partial<LetterboxdRating>;

  // filmUrl is rendered as a link and fed to window.open on every
  // participant's device — never store a URL off letterboxd.com
  if (
    !isFiniteNumber(rating.rating) ||
    !isBoundedString(rating.filmUrl, 500) ||
    !rating.filmUrl.startsWith('https://letterboxd.com/')
  ) {
    return null;
  }

  return {
    rating: rating.rating,
    ratingText: isBoundedString(rating.ratingText, 100) ? rating.ratingText : `${rating.rating} out of 5`,
    filmUrl: rating.filmUrl,
    tmdbId: isPositiveInteger(rating.tmdbId) ? rating.tmdbId : 0,
  };
};

// Rebuild each movie from allowlisted, size-capped fields. Client payloads are
// stored verbatim into the session (and frozen into the nomination pool), then
// rendered on every participant's device — nothing unvetted may survive this.
export const sanitizeMovies = (movies: Movie[]): Movie[] => {
  return movies.map(movie => ({
    id: movie.id,
    title: movie.title.slice(0, MAX_MOVIE_TITLE_LENGTH),
    overview: isBoundedString(movie.overview, 2000) ? movie.overview : '',
    poster_path: isBoundedString(movie.poster_path, 300) ? movie.poster_path : null,
    backdrop_path: isBoundedString(movie.backdrop_path, 300) ? movie.backdrop_path : null,
    release_date: isBoundedString(movie.release_date, 20) ? movie.release_date : '',
    vote_average: isFiniteNumber(movie.vote_average) ? movie.vote_average : 0,
    vote_count: isPositiveInteger(movie.vote_count) ? movie.vote_count : 0,
    genre_ids: Array.isArray(movie.genre_ids)
      ? movie.genre_ids.filter(isPositiveInteger).slice(0, 20)
      : [],
    runtime: isPositiveInteger(movie.runtime) ? movie.runtime : undefined,
    director: isBoundedString(movie.director, 200) ? movie.director : undefined,
    letterboxdRating: sanitizeLetterboxdRating(movie.letterboxdRating),
  }));
};
