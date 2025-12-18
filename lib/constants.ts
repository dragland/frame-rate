/**
 * Application-wide constants
 * Centralized configuration for magic numbers and reusable values
 */

/**
 * Session Configuration
 */
export const SESSION_CONFIG = {
  /** Session time-to-live in seconds (24 hours) */
  TTL_SECONDS: 24 * 60 * 60,

  /** Session time-to-live in milliseconds (24 hours) */
  TTL_MS: 24 * 60 * 60 * 1000,

  /** Maximum number of participants allowed in a session */
  MAX_PARTICIPANTS: 8,

  /** Length of session codes (e.g., 'ABCD' = 4 characters) */
  CODE_LENGTH: 4,

  /** Maximum attempts to generate a unique session code */
  MAX_CODE_GENERATION_ATTEMPTS: 10,

  /** Characters allowed in session codes */
  CODE_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
} as const;

/**
 * Movie Configuration
 */
export const MOVIE_CONFIG = {
  /** Maximum number of movies each participant can nominate */
  MAX_NOMINATIONS_PER_USER: 2,

  /** Number of search results to display initially */
  INITIAL_SEARCH_RESULTS: 5,

  /** Number of additional results to load on "Load More" */
  LOAD_MORE_INCREMENT: 5,
} as const;

/**
 * Cache Configuration
 * All caches expire after 6 hours (one movie night session)
 */
export const CACHE_CONFIG = {
  /** Cache TTL in seconds (6 hours - one movie night session) */
  TTL: 6 * 60 * 60,
} as const;

/**
 * External API Configuration
 */
export const API_CONFIG = {
  /** TMDB API base URL */
  TMDB_BASE_URL: 'https://api.themoviedb.org/3',

  /** TMDB image base URL */
  TMDB_IMAGE_BASE_URL: 'https://image.tmdb.org/t/p',

  /** Letterboxd base URL */
  LETTERBOXD_BASE_URL: 'https://letterboxd.com',
} as const;
