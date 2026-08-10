import { Session, SessionResponse, CreateSessionRequest, JoinSessionRequest, UpdateMoviesRequest } from './types';
import { Movie } from './tmdb';

export const createSession = async (username: string): Promise<SessionResponse> => {
  const response = await fetch('/api/sessions/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username } as CreateSessionRequest),
  });
  
  return response.json();
};

export const joinSession = async (code: string, username: string): Promise<SessionResponse> => {
  const response = await fetch('/api/sessions/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username } as JoinSessionRequest),
  });
  
  return response.json();
};

export const updateMovies = async (code: string, username: string, movies: Movie[]): Promise<SessionResponse> => {
  const response = await fetch('/api/sessions/update', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username, movies } as UpdateMoviesRequest),
  });
  
  return response.json();
};

export const leaveSession = async (code: string, username: string): Promise<SessionResponse> => {
  const response = await fetch('/api/sessions/leave', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username }),
  });

  return response.json();
};

export type DebouncedFunction<T extends (...args: any[]) => void> =
  ((...args: Parameters<T>) => void) & { cancel: () => void };

// Utility to debounce movie updates
export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): DebouncedFunction<T> => {
  let timeoutId: NodeJS.Timeout | undefined;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => func(...args), delay);
  }) as DebouncedFunction<T>;

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return debounced;
}; 
