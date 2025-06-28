import { Movie } from './tmdb';

export type VotingPhase = 'ranking' | 'locked' | 'vetoing' | 'results';

export interface SessionParticipant {
  username: string;
  movies: Movie[];
  joinedAt: Date;
  hasVoted?: boolean;
  vetoedMovieId?: number;
}

export interface VotingResults {
  winner: Movie;
  eliminatedMovies: Movie[];
  rounds: {
    round: number;
    eliminated?: Movie;
    votes: { [movieId: number]: number };
  }[];
}

export interface Session {
  code: string;
  host: string;
  participants: SessionParticipant[];
  createdAt: Date;
  expiresAt: Date; // Sessions expire after 24 hours
  isVotingOpen: boolean;
  maxParticipants: number;
  votingPhase: VotingPhase;
  votingResults?: VotingResults;
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

export interface StartVotingRequest {
  code: string;
  username: string;
}

export interface VetoMovieRequest {
  code: string;
  username: string;
  movieId: number;
}

export interface SessionResponse {
  success: boolean;
  session?: Session;
  error?: string;
} 