import { useState, useCallback } from 'react';
import { Movie } from '@/lib/types';
import { searchMovies, getMovieDetails } from '@/lib/tmdb';
import { getLetterboxdRating, LetterboxdRating } from '@/lib/letterboxd';
import { MOVIE_CONFIG } from '@/lib/constants';

export interface MovieWithDetails extends Movie {
  letterboxdRating?: LetterboxdRating | null;
  runtime?: number;
  director?: string;
}

export interface UseMovieSearchReturn {
  searchResults: MovieWithDetails[];
  isSearching: boolean;
  hasMore: boolean;
  totalResults: number;
  searchError: string | null;
  performSearch: (query: string) => Promise<void>;
  loadMore: () => Promise<void>;
  clearSearch: () => void;
}

/**
 * Custom hook to handle movie search with enriched data
 *
 * Features:
 * - Search movies via TMDB
 * - Enrich with Letterboxd ratings
 * - Enrich with movie details (runtime, director)
 * - Pagination support
 * - Loading and error states
 *
 * @returns Movie search state and functions
 */
export function useMovieSearch(): UseMovieSearchReturn {
  const [searchResults, setSearchResults] = useState<MovieWithDetails[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [currentQuery, setCurrentQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalResults, setTotalResults] = useState(0);

  const hasMore = searchResults.length < totalResults;

  /**
   * Enriches a single movie with additional details
   */
  const enrichMovie = async (movie: Movie): Promise<MovieWithDetails> => {
    try {
      const [letterboxdRating, movieDetails] = await Promise.all([
        getLetterboxdRating(movie.id),
        getMovieDetails(movie.id)
      ]);

      return {
        ...movie,
        letterboxdRating,
        runtime: movieDetails?.runtime,
        director: movieDetails?.director
      };
    } catch (error) {
      return movie;
    }
  };

  /**
   * Perform a new search
   */
  const performSearch = useCallback(async (query: string): Promise<void> => {
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentQuery('');
      setTotalResults(0);
      setSearchError(null);
      return;
    }

    setIsSearching(true);
    setSearchError(null);
    setCurrentQuery(query);
    setCurrentPage(1);

    try {
      const results = await searchMovies(query, 1);

      setTotalResults(results.total_results);

      // Enrich first batch of movies
      const firstBatch = results.results.slice(0, MOVIE_CONFIG.INITIAL_SEARCH_RESULTS);
      const enrichedMovies = await Promise.all(
        firstBatch.map(movie => enrichMovie(movie))
      );

      setSearchResults(enrichedMovies);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Search failed');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  /**
   * Load more search results (pagination)
   */
  const loadMore = useCallback(async (): Promise<void> => {
    if (!currentQuery || isSearching || !hasMore) {
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      // Calculate which page we need to fetch
      const targetCount = searchResults.length + MOVIE_CONFIG.LOAD_MORE_INCREMENT;
      const allFetchedMovies: Movie[] = [];
      let page = 1;

      // Fetch pages until we have enough movies
      while (allFetchedMovies.length < targetCount) {
        const results = await searchMovies(currentQuery, page);

        if (results.results.length === 0) {
          break;
        }

        allFetchedMovies.push(...results.results);
        page++;
      }

      // Only enrich the new movies we're showing
      const moviesToShow = allFetchedMovies.slice(0, targetCount);
      const newMovies = moviesToShow.slice(searchResults.length);

      const enrichedNewMovies = await Promise.all(
        newMovies.map(movie => enrichMovie(movie))
      );

      setSearchResults([...searchResults, ...enrichedNewMovies]);
      setCurrentPage(page);
    } catch (error) {
      setSearchError('Failed to load more results');
    } finally {
      setIsSearching(false);
    }
  }, [currentQuery, searchResults, isSearching, hasMore]);

  /**
   * Clear search results
   */
  const clearSearch = useCallback((): void => {
    setSearchResults([]);
    setCurrentQuery('');
    setCurrentPage(1);
    setTotalResults(0);
    setSearchError(null);
  }, []);

  return {
    searchResults,
    isSearching,
    hasMore,
    totalResults,
    searchError,
    performSearch,
    loadMore,
    clearSearch
  };
}
