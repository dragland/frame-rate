import { Movie } from './tmdb';

export interface SessionParticipant {
  username: string;
  movies: Movie[];
  joinedAt: Date;
}

export interface Session {
  code: string;
  host: string;
  participants: SessionParticipant[];
  createdAt: Date;
  expiresAt: Date; // Sessions expire after 24 hours
  isVotingOpen: boolean;
  maxParticipants: number;
}

export interface CreateSessionRequest {
  username: string;
}

export interface JoinSessionRequest {
  code: string;
  username: string;
}

export interface UpdateMoviesRequest {
  code: string;
  username: string;
  movies: Movie[];
}

export interface SessionResponse {
  success: boolean;
  session?: Session;
  error?: string;
} 