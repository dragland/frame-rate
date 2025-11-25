import { Movie } from './tmdb';

// Re-export Movie for convenience
export type { Movie };

export type VotingPhase = 'ranking' | 'locked' | 'vetoing' | 'finalRanking' | 'results';

export interface SessionParticipant {
  username: string;
  movies: Movie[];
  finalMovies?: Movie[]; // Rankings after vetoing phase
  joinedAt: Date;
  hasVoted?: boolean;
  vetoedMovieId?: number;
  vetoedNominationId?: string; // Format: "movieId-nominatedBy" to track specific nominations
  profilePicture?: string | null; // Letterboxd profile picture URL
  letterboxdExists?: boolean; // Whether the Letterboxd profile exists
}

export interface VotingResults {
  winner: Movie;
  eliminatedMovies: Movie[];
  rounds: {
    round: number;
    eliminated?: Movie;
    votes: { [movieId: number]: number };
  }[];
  tieBreaking?: {
    isTieBreaker: boolean;
    tiedMovies: string[];
    message: string;
  };
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
  nominationId?: string; // Optional: for tracking specific nominations
}

export interface UpdateFinalMoviesRequest {
  code: string;
  username: string;
  movies: Movie[];
}

export interface SessionResponse {
  success: boolean;
  session?: Session;
  error?: string;
} 