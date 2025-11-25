import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, Movie } from '@/lib/types';
import { getSession, updateMoviesInSession } from '@/lib/session';
import { POLLING_CONFIG, MOVIE_CONFIG } from '@/lib/constants';

export interface UseSessionOptions {
  sessionCode: string;
  username: string;
  onSessionNotFound?: () => void;
}

export interface UseSessionReturn {
  session: Session | null;
  myMovies: Movie[];
  isUpdating: boolean;
  error: string | null;
  updateMyMovies: (movies: Movie[]) => void;
  refreshSession: () => Promise<void>;
}

/**
 * Custom hook to manage session state and real-time updates
 *
 * Features:
 * - Automatic polling every 5 seconds
 * - Debounced movie updates (1 second)
 * - Handles session not found errors
 * - Synchronizes local state with server
 *
 * @param options - Session configuration
 * @returns Session state and update functions
 */
export function useSession({
  sessionCode,
  username,
  onSessionNotFound
}: UseSessionOptions): UseSessionReturn {
  const [session, setSession] = useState<Session | null>(null);
  const [myMovies, setMyMovies] = useState<Movie[]>([]);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use ref to track the latest movies for debounced updates
  const pendingMoviesRef = useRef<Movie[] | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Poll the session from the server
   */
  const refreshSession = useCallback(async (): Promise<void> => {
    try {
      const response = await getSession(sessionCode);

      if (!response.success || !response.session) {
        setError(response.error || 'Failed to load session');
        if (onSessionNotFound) {
          onSessionNotFound();
        }
        return;
      }

      setSession(response.session);
      setError(null);

      // Sync local movies with server (only if different)
      const myParticipant = response.session.participants.find(
        p => p.username === username
      );

      if (myParticipant) {
        // Only update if server has different data AND we don't have pending updates
        const serverMoviesJson = JSON.stringify(myParticipant.movies);
        const localMoviesJson = JSON.stringify(myMovies);

        if (serverMoviesJson !== localMoviesJson && !pendingMoviesRef.current) {
          setMyMovies(myParticipant.movies || []);
        }
      }
    } catch (err) {
      setError('Failed to load session');
    }
  }, [sessionCode, username, myMovies, onSessionNotFound]);

  /**
   * Update my movies with debouncing
   */
  const updateMyMovies = useCallback((movies: Movie[]): void => {
    // Immediately update local state for instant UI feedback
    setMyMovies(movies);

    // Store pending movies
    pendingMoviesRef.current = movies;

    // Clear existing timeout
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    // Debounce the server update
    updateTimeoutRef.current = setTimeout(async () => {
      const moviesToUpdate = pendingMoviesRef.current;
      if (!moviesToUpdate) return;

      // Limit to max nominations
      const limitedMovies = moviesToUpdate.slice(0, MOVIE_CONFIG.MAX_NOMINATIONS_PER_USER);

      setIsUpdating(true);
      try {
        const response = await updateMoviesInSession(
          sessionCode,
          username,
          limitedMovies
        );

        if (response.success && response.session) {
          setSession(response.session);
          setError(null);
        } else {
          setError(response.error || 'Failed to update movies');
        }
      } catch (err) {
        setError('Failed to update movies');
      } finally {
        setIsUpdating(false);
        pendingMoviesRef.current = null;
      }
    }, POLLING_CONFIG.UPDATE_DEBOUNCE_MS);
  }, [sessionCode, username]);

  /**
   * Set up polling interval
   */
  useEffect(() => {
    // Initial fetch
    refreshSession();

    // Set up polling
    const interval = setInterval(
      refreshSession,
      POLLING_CONFIG.SESSION_POLL_INTERVAL_MS
    );

    return () => {
      clearInterval(interval);
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [refreshSession]);

  return {
    session,
    myMovies,
    isUpdating,
    error,
    updateMyMovies,
    refreshSession
  };
}
