import { useState, useEffect, useCallback, useRef } from 'react';
import { Session, Movie } from '@/lib/types';
import { getSession, updateMovies } from '@/lib/session';
import { POLLING_CONFIG, MOVIE_CONFIG } from '@/lib/constants';

/**
 * Check if SSE is supported in the current environment
 */
const isSSESupported = typeof window !== 'undefined' && 'EventSource' in window;

/**
 * SSE reconnection configuration
 */
const SSE_CONFIG = {
  MAX_RECONNECT_ATTEMPTS: 3,
  INITIAL_RECONNECT_DELAY_MS: 1000,
};

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
 * - Server-Sent Events (SSE) for instant updates when supported
 * - Automatic polling fallback if SSE unavailable
 * - SSE reconnection with exponential backoff
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

  // Refs for SSE/polling handles to ensure proper cleanup
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to access current myMovies without causing callback recreation
  const myMoviesRef = useRef<Movie[]>(myMovies);
  useEffect(() => { myMoviesRef.current = myMovies; }, [myMovies]);

  /**
   * Sync local movies with server state (only if different and no pending updates)
   * Uses ref to avoid stale closure issues
   */
  const syncMoviesFromSession = useCallback((newSession: Session) => {
    const myParticipant = newSession.participants.find(p => p.username === username);
    if (myParticipant && !pendingMoviesRef.current) {
      const serverMoviesJson = JSON.stringify(myParticipant.movies);
      const localMoviesJson = JSON.stringify(myMoviesRef.current);

      if (serverMoviesJson !== localMoviesJson) {
        setMyMovies(myParticipant.movies || []);
      }
    }
  }, [username]);

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
      syncMoviesFromSession(response.session);
    } catch (err) {
      setError('Failed to load session');
    }
  }, [sessionCode, onSessionNotFound, syncMoviesFromSession]);

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
        const response = await updateMovies(
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
   * Handle incoming session data (from SSE or polling)
   */
  const handleSessionUpdate = useCallback((newSession: Session) => {
    setSession(newSession);
    setError(null);
    syncMoviesFromSession(newSession);
  }, [syncMoviesFromSession]);

  /**
   * Start polling as fallback when SSE is unavailable or fails
   */
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return; // Already polling

    refreshSession();
    pollIntervalRef.current = setInterval(
      refreshSession,
      POLLING_CONFIG.SESSION_POLL_INTERVAL_MS
    );
  }, [refreshSession]);

  /**
   * Stop polling
   */
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  /**
   * Set up SSE connection with reconnection support
   */
  const connectSSE = useCallback((reconnectAttempts = 0) => {
    // Clean up any existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    const eventSource = new EventSource(`/api/sessions/${sessionCode}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const session: Session = JSON.parse(event.data);
        handleSessionUpdate(session);
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.addEventListener('session-expired', () => {
      setError('Session not found or expired');
      if (onSessionNotFound) {
        onSessionNotFound();
      }
      eventSource.close();
      eventSourceRef.current = null;
    });

    eventSource.addEventListener('error', () => {
      eventSource.close();
      eventSourceRef.current = null;

      // Try to reconnect with exponential backoff
      if (reconnectAttempts < SSE_CONFIG.MAX_RECONNECT_ATTEMPTS) {
        const delay = SSE_CONFIG.INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts);
        console.warn(`SSE connection lost, reconnecting in ${delay}ms (attempt ${reconnectAttempts + 1}/${SSE_CONFIG.MAX_RECONNECT_ATTEMPTS})`);

        reconnectTimeoutRef.current = setTimeout(() => {
          connectSSE(reconnectAttempts + 1);
        }, delay);
      } else {
        // Max reconnect attempts reached - fall back to polling
        console.warn('SSE reconnection failed, falling back to polling');
        startPolling();
      }
    });
  }, [sessionCode, handleSessionUpdate, onSessionNotFound, startPolling]);

  /**
   * Set up SSE connection or polling fallback
   */
  useEffect(() => {
    if (isSSESupported) {
      connectSSE();
    } else {
      // SSE not supported - use polling
      startPolling();
    }

    return () => {
      // Clean up SSE
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      // Clean up polling
      stopPolling();
      // Clean up reconnect timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // Clean up debounce timeout
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [connectSSE, startPolling, stopPolling]);

  return {
    session,
    myMovies,
    isUpdating,
    error,
    updateMyMovies,
    refreshSession
  };
}
