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

export const getSession = async (code: string): Promise<SessionResponse> => {
  const response = await fetch(`/api/sessions/${code}`);
  return response.json();
};

// Utility to debounce movie updates
export const debounce = <T extends (...args: any[]) => void>(
  func: T,
  delay: number
): ((...args: Parameters<T>) => void) => {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}; 