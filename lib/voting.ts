import { Movie } from './tmdb';
import { Session, SessionParticipant, VotingResults, StartVotingRequest, VetoMovieRequest, UpdateFinalMoviesRequest } from './types';

export const canStartVoting = (session: Session): boolean => {
  return session.participants.every(p => p.movies.length >= 2) && 
         session.participants.length >= 2;
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

// Get all movie nominations including duplicates (for veto phase)
export const getAllMovieNominations = (session: Session): (Movie & { nominatedBy: string })[] => {
  const nominations: (Movie & { nominatedBy: string })[] = [];
  session.participants.forEach(participant => {
    // Only take the first 2 movies from each participant for the voting pool
    participant.movies.slice(0, 2).forEach(movie => {
      nominations.push({ ...movie, nominatedBy: participant.username });
    });
  });
  return nominations;
};

export const getVetoedMovies = (session: Session): Movie[] => {
  const vetoedIds = session.participants
    .filter(p => p.vetoedMovieId)
    .map(p => p.vetoedMovieId!);
  
  const allMovies = getAllMovies(session);
  return allMovies.filter(movie => vetoedIds.includes(movie.id));
};

// Get vetoed nominations (including duplicates)
export const getVetoedNominations = (session: Session): string[] => {
  return session.participants
    .filter(p => p.vetoedNominationId)
    .map(p => p.vetoedNominationId!);
};

// Get remaining nominations after vetoes
export const getRemainingNominations = (session: Session): (Movie & { nominatedBy: string; nominationId: string })[] => {
  const allNominations = getAllMovieNominations(session);
  const vetoedNominationIds = getVetoedNominations(session);
  
  return allNominations
    .map(nomination => ({
      ...nomination,
      nominationId: `${nomination.id}-${nomination.nominatedBy}`
    }))
    .filter(nomination => !vetoedNominationIds.includes(nomination.nominationId));
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
  let eliminationTieBreaking = false;

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

export const vetoNomination = async (code: string, username: string, nominationId: string) => {
  const [movieIdStr] = nominationId.split('-');
  const movieId = parseInt(movieIdStr);

  const response = await fetch('/api/sessions/veto', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, username, movieId, nominationId } as VetoMovieRequest),
  });
  return response.json();
}; 