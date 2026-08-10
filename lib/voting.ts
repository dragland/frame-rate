import { Movie } from './tmdb';
import { MovieNomination, Session, SessionParticipant, VotingResults, StartVotingRequest, VetoMovieRequest, UpdateFinalMoviesRequest } from './types';

export type { MovieNomination };

export const createNominationId = (movieId: number, username: string): string => {
  return `${movieId}-${username}`;
};

const hasTwoUniqueTopMovies = (participant: SessionParticipant): boolean => {
  const topTwo = participant.movies.slice(0, 2);
  return topTwo.length === 2 && new Set(topTwo.map(movie => movie.id)).size === 2;
};

export const canStartVoting = (session: Session): boolean => {
  return session.participants.every(hasTwoUniqueTopMovies) &&
         session.participants.length >= 2;
};

// Freeze each participant's top 2 into the session's nomination pool and reset
// vetoes. From here on the pool is immutable — participants leaving (or
// rejoining) can't change what's up for vote.
export const lockNominations = (session: Session): void => {
  session.nominations = session.participants.flatMap(participant =>
    participant.movies.slice(0, 2).map(movie => ({
      ...movie,
      nominatedBy: participant.username,
      nominationId: createNominationId(movie.id, participant.username),
    }))
  );
  session.vetoes = {};
};

// Only people who contributed nominations at lock time may vote (or rejoin mid-vote)
export const isEligibleVoter = (session: Session, username: string): boolean => {
  return session.nominations.some(nomination => nomination.nominatedBy === username);
};

export const hasVetoed = (session: Session, username: string): boolean => {
  return username in session.vetoes;
};

export const getAllMovies = (session: Session): Movie[] => {
  const movieMap = new Map<number, Movie>();
  session.participants.forEach(participant => {
    // Only take the first 2 movies from each participant for the voting pool
    participant.movies.slice(0, 2).forEach(movie => {
      movieMap.set(movie.id, movie);
    });
  });
  return Array.from(movieMap.values());
};

// Get remaining nominations after vetoes
export const getRemainingNominations = (session: Session): MovieNomination[] => {
  const vetoedNominationIds = new Set(Object.values(session.vetoes));
  return session.nominations
    .filter(nomination => !vetoedNominationIds.has(nomination.nominationId));
};

export const getRemainingMovies = (session: Session): Movie[] => {
  const movieMap = new Map<number, Movie>();

  getRemainingNominations(session).forEach(nomination => {
    movieMap.set(nomination.id, nomination);
  });

  return Array.from(movieMap.values());
};

export const findRemainingNomination = (
  session: Session,
  nominationId: string
): MovieNomination | undefined => {
  return getRemainingNominations(session).find(nomination => nomination.nominationId === nominationId);
};

export const hasDuplicateMovieIds = (movies: Movie[]): boolean => {
  return new Set(movies.map(movie => movie.id)).size !== movies.length;
};

export const isExactMovieSet = (movies: Movie[], expectedMovies: Movie[]): boolean => {
  if (movies.length !== expectedMovies.length || hasDuplicateMovieIds(movies)) {
    return false;
  }

  const expectedIds = new Set(expectedMovies.map(movie => movie.id));
  return movies.every(movie => expectedIds.has(movie.id));
};

export const orderMoviesFromCanonicalSet = (movies: Movie[], canonicalMovies: Movie[]): Movie[] => {
  return movies.map(movie => canonicalMovies.find(canonicalMovie => canonicalMovie.id === movie.id)!);
};

export const calculateRankedChoiceWinner = (session: Session): VotingResults => {
  const allMovies = getAllMovies(session);
  let remainingMovies = getRemainingMovies(session);
  const eliminatedMovies: Movie[] = [];
  const rounds: VotingResults['rounds'] = [];
  let round = 1;
  let eliminationTieBreaking = false;

  if (remainingMovies.length === 0) {
    throw new Error('Cannot calculate winner with no remaining movies');
  }

  console.log(`🗳️ Starting ranked choice voting:`);
  console.log(`📊 Total movies: ${allMovies.length}, Remaining: ${remainingMovies.length}`);
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
        rounds,
        tieBreaking: eliminationTieBreaking ? {
          isTieBreaker: true,
          tiedMovies: [],
          message: `Some eliminations required coin flips 🪙`
        } : undefined
      };
    }

    // Find movie with fewest votes to eliminate
    const minVotes = Math.min(...Object.values(votes));
    const moviesWithMinVotes = remainingMovies.filter(movie => votes[movie.id] === minVotes);
    
    // Handle ties by random selection
    let eliminated: Movie;
    if (moviesWithMinVotes.length > 1) {
      console.log(`⚖️ Tie for elimination between: ${moviesWithMinVotes.map(m => m.title).join(', ')} (${minVotes} votes each)`);
      const randomIndex = Math.floor(Math.random() * moviesWithMinVotes.length);
      eliminated = moviesWithMinVotes[randomIndex];
      console.log(`🎲 Random elimination: ${eliminated.title}`);
      eliminationTieBreaking = true;
    } else {
      eliminated = moviesWithMinVotes[0];
    }
    
    rounds.push({ round, eliminated, votes });
    eliminatedMovies.push(eliminated);
    remainingMovies = remainingMovies.filter(movie => movie.id !== eliminated.id);
    round++;
  }

  // Handle final tie-breaking if needed
  if (remainingMovies.length === 1) {
    return {
      winner: remainingMovies[0],
      eliminatedMovies,
      rounds,
      tieBreaking: eliminationTieBreaking ? {
        isTieBreaker: true,
        tiedMovies: [],
        message: `Some eliminations required coin flips 🪙`
      } : undefined
    };
  }
  
  // If we somehow have multiple movies left (shouldn't happen with proper RCV), 
  // pick winner based on final vote counts
  const finalVotes: { [movieId: number]: number } = {};
  remainingMovies.forEach(movie => {
    finalVotes[movie.id] = 0;
  });
  
  session.participants.forEach(participant => {
    const movieList = participant.finalMovies && participant.finalMovies.length > 0 
      ? participant.finalMovies 
      : participant.movies;
    
    const firstChoice = movieList.find(movie => 
      remainingMovies.some(rm => rm.id === movie.id)
    );
    if (firstChoice) {
      finalVotes[firstChoice.id]++;
    }
  });
  
  const maxVotes = Math.max(...Object.values(finalVotes));
  const winnersWithMaxVotes = remainingMovies.filter(movie => finalVotes[movie.id] === maxVotes);
  
  let finalWinner: Movie;
  let tieBreaking = undefined;
  
  if (winnersWithMaxVotes.length > 1) {
    console.log(`🎲 Final tie between: ${winnersWithMaxVotes.map(m => m.title).join(', ')} (${maxVotes} votes each)`);
    const randomIndex = Math.floor(Math.random() * winnersWithMaxVotes.length);
    finalWinner = winnersWithMaxVotes[randomIndex];
    console.log(`🏆 Random winner: ${finalWinner.title}`);
    
    tieBreaking = {
      isTieBreaker: true,
      tiedMovies: winnersWithMaxVotes.map(m => m.title),
      message: `It was a tie! Making an executive decision with a coin flip 🪙`
    };
  } else {
    finalWinner = winnersWithMaxVotes[0];
  }
  
  rounds.push({ round, votes: finalVotes });
  
  return {
    winner: finalWinner,
    eliminatedMovies,
    rounds,
    tieBreaking
  };
};

// Advance the phase when every participant has completed the current phase's action.
// Called at the end of every atomic modifier that can complete a phase (veto,
// final-movies, leave) so the transition rules live in exactly one place.
export const advanceVotingPhaseIfComplete = (session: Session): void => {
  if (session.votingPhase === 'vetoing' && session.participants.every(p => hasVetoed(session, p.username))) {
    if (getRemainingMovies(session).length <= 1) {
      session.votingPhase = 'results';
      session.votingResults = calculateRankedChoiceWinner(session);
      return;
    }

    session.votingPhase = 'finalRanking';
    session.participants.forEach(p => {
      p.finalMovies = undefined;
    });
    return;
  }

  if (session.votingPhase === 'finalRanking') {
    const remainingMovies = getRemainingMovies(session);
    const allCompleted = session.participants.every(
      p => p.finalMovies && isExactMovieSet(p.finalMovies, remainingMovies)
    );

    if (remainingMovies.length <= 1 || allCompleted) {
      session.votingPhase = 'results';
      session.votingResults = calculateRankedChoiceWinner(session);
    }
  }
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

export const vetoNomination = async (code: string, username: string, nominationId: string) => {
  const response = await fetch('/api/sessions/veto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username, nominationId } as VetoMovieRequest),
  });
  return response.json();
};
