import { Movie } from './tmdb';

export const SESSION_CODE_PATTERN = /^[A-Z]{4}$/;
export const USERNAME_PATTERN = /^[a-z0-9_]{1,32}$/;

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
  return USERNAME_PATTERN.test(normalizeUsername(username));
};

export const isPositiveInteger = (value: unknown): value is number => {
  return Number.isInteger(value) && typeof value === 'number' && value > 0;
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
