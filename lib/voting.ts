import { Movie } from './tmdb';
import { Session, SessionParticipant, VotingResults, StartVotingRequest, VetoMovieRequest, UpdateFinalMoviesRequest } from './types';

export const canStartVoting = (session: Session): boolean => {
  return session.participants.every(p => p.movies.length >= 2) && 
         session.participants.length >= 2;
};

export const getAllMovies = (session: Session): Movie[] => {
  const movieMap = new Map<number, Movie>();
  session.participants.forEach(participant => {
    participant.movies.forEach(movie => {
      movieMap.set(movie.id, movie);
    });
  });
  return Array.from(movieMap.values());
};

export const getVetoedMovies = (session: Session): Movie[] => {
  const vetoedIds = session.participants
    .filter(p => p.vetoedMovieId)
    .map(p => p.vetoedMovieId!);
  
  const allMovies = getAllMovies(session);
  return allMovies.filter(movie => vetoedIds.includes(movie.id));
};

export const getRemainingMovies = (session: Session): Movie[] => {
  const allMovies = getAllMovies(session);
  const vetoedMovieIds = session.participants
    .filter(p => p.vetoedMovieId)
    .map(p => p.vetoedMovieId!);
  
  return allMovies.filter(movie => !vetoedMovieIds.includes(movie.id));
};

export const calculateRankedChoiceWinner = (session: Session): VotingResults => {
  const allMovies = getAllMovies(session);
  const vetoedMovieIds = session.participants
    .filter(p => p.vetoedMovieId)
    .map(p => p.vetoedMovieId!);
  
  // Remove vetoed movies
  let remainingMovies = allMovies.filter(movie => !vetoedMovieIds.includes(movie.id));
  const eliminatedMovies: Movie[] = [];
  const rounds: VotingResults['rounds'] = [];
  let round = 1;

  console.log(`🗳️ Starting ranked choice voting:`);
  console.log(`📊 Total movies: ${allMovies.length}, Vetoed: ${vetoedMovieIds.length}, Remaining: ${remainingMovies.length}`);
  console.log(`🎬 Remaining movies:`, remainingMovies.map(m => m.title));

  while (remainingMovies.length > 1) {
    const votes: { [movieId: number]: number } = {};
    
    // Initialize vote counts
    remainingMovies.forEach(movie => {
      votes[movie.id] = 0;
    });

    // Count first-choice votes for remaining movies
    // Use finalMovies if available (after final ranking), otherwise fall back to original movies
    session.participants.forEach(participant => {
      const movieList = participant.finalMovies && participant.finalMovies.length > 0 
        ? participant.finalMovies 
        : participant.movies;
      
      const firstChoice = movieList.find(movie => 
        remainingMovies.some(rm => rm.id === movie.id)
      );
      if (firstChoice) {
        votes[firstChoice.id]++;
      }
    });

    // Check for majority winner
    const totalVotes = session.participants.length;
    const majority = Math.floor(totalVotes / 2) + 1;
    
    const winner = remainingMovies.find(movie => votes[movie.id] >= majority);
    if (winner) {
      rounds.push({ round, votes });
      return {
        winner,
        eliminatedMovies,
        rounds
      };
    }

    // Find movie with fewest votes to eliminate
    const minVotes = Math.min(...Object.values(votes));
    const eliminated = remainingMovies.find(movie => votes[movie.id] === minVotes)!;
    
    rounds.push({ round, eliminated, votes });
    eliminatedMovies.push(eliminated);
    remainingMovies = remainingMovies.filter(movie => movie.id !== eliminated.id);
    round++;
  }

  // Return last remaining movie as winner
  return {
    winner: remainingMovies[0],
    eliminatedMovies,
    rounds
  };
};

export const updateFinalMovies = async (code: string, username: string, movies: Movie[]) => {
  const response = await fetch('/api/sessions/final-movies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username, movies } as UpdateFinalMoviesRequest),
  });
  return response.json();
};

export const startVoting = async (code: string, username: string) => {
  const response = await fetch('/api/sessions/start-voting', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username } as StartVotingRequest),
  });
  return response.json();
};

export const vetoMovie = async (code: string, username: string, movieId: number) => {
  const response = await fetch('/api/sessions/veto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username, movieId } as VetoMovieRequest),
  });
  return response.json();
}; 