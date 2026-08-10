import { Movie } from './tmdb';

// Re-export Movie for convenience
export type { Movie };

export type VotingPhase = 'ranking' | 'vetoing' | 'finalRanking' | 'results';

export type MovieNomination = Movie & {
  nominatedBy: string;
  nominationId: string; // Format: "movieId-nominatedBy"
};

export interface SessionParticipant {
  username: string;
  movies: Movie[];
  finalMovies?: Movie[]; // Rankings after vetoing phase
  joinedAt: Date;
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
  isVotingOpen: boolean;
  maxParticipants: number;
  votingPhase: VotingPhase;
  // Frozen at lock time (start-voting). Survives participants leaving, and is
  // the eligibility record: only usernames with nominations here may vote.
  nominations: MovieNomination[];
  // username → vetoed nominationId. Lives on the session, not the participant,
  // so leaving/rejoining can neither undo nor repeat a veto.
  vetoes: Record<string, string>;
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
  nominationId: string; // Format: "movieId-nominatedBy"
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
