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
  session.finalRankings = {};
};

// Everyone who contributed nominations at lock time, present or not. Phase
// completion is judged against this set — being away never fast-forwards a
// phase past someone's veto or ranking.
export const getEligibleVoters = (session: Session): string[] => {
  return Array.from(new Set(session.nominations.map(n => n.nominatedBy)));
};

// Only people who contributed nominations at lock time may vote (or rejoin mid-vote)
export const isEligibleVoter = (session: Session, username: string): boolean => {
  return session.nominations.some(nomination => nomination.nominatedBy === username);
};

// Object.hasOwn (not `in`): these maps are JSON-parsed plain objects, so `in`
// would answer true for inherited keys like 'constructor'
export const hasVetoed = (session: Session, username: string): boolean => {
  return Object.hasOwn(session.vetoes, username);
};

export const hasFinalRanked = (session: Session, username: string): boolean => {
  return Object.hasOwn(session.finalRankings, username);
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

// One ballot per eligible voter: their submitted final ranking, or their
// nomination order from the frozen pool if they never submitted one
const getBallots = (session: Session): Movie[][] => {
  return getEligibleVoters(session).map(username =>
    Object.hasOwn(session.finalRankings, username)
      ? session.finalRankings[username]
      : session.nominations.filter(n => n.nominatedBy === username)
  );
};

export const calculateRankedChoiceWinner = (session: Session): VotingResults => {
  const ballots = getBallots(session);
  let remainingMovies = getRemainingMovies(session);
  const eliminatedMovies: Movie[] = [];
  const rounds: VotingResults['rounds'] = [];
  let round = 1;
  let eliminationTieBreaking = false;

  if (remainingMovies.length === 0) {
    throw new Error('Cannot calculate winner with no remaining movies');
  }

  while (remainingMovies.length > 1) {
    const votes: { [movieId: number]: number } = {};

    // Initialize vote counts
    remainingMovies.forEach(movie => {
      votes[movie.id] = 0;
    });

    // Count first-choice votes for remaining movies
    ballots.forEach(ballot => {
      const firstChoice = ballot.find(movie =>
        remainingMovies.some(rm => rm.id === movie.id)
      );
      if (firstChoice) {
        votes[firstChoice.id]++;
      }
    });

    // Check for majority winner
    const totalVotes = ballots.length;
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
      const randomIndex = Math.floor(Math.random() * moviesWithMinVotes.length);
      eliminated = moviesWithMinVotes[randomIndex];
      eliminationTieBreaking = true;
    } else {
      eliminated = moviesWithMinVotes[0];
    }
    
    rounds.push({ round, eliminated, votes });
    eliminatedMovies.push(eliminated);
    remainingMovies = remainingMovies.filter(movie => movie.id !== eliminated.id);
    round++;
  }

  // The loop only exits once a single movie remains (an empty pool throws above)
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
};

// Advance the phase when every eligible voter has completed the current
// phase's action. Called from the veto and final-movies routes so the
// transition rules live in exactly one place; presence is irrelevant, so the
// leave route deliberately does not call this.
export const advanceVotingPhaseIfComplete = (session: Session): void => {
  const eligibleVoters = getEligibleVoters(session);

  if (session.votingPhase === 'vetoing' && eligibleVoters.every(voter => hasVetoed(session, voter))) {
    if (getRemainingMovies(session).length <= 1) {
      session.votingPhase = 'results';
      session.votingResults = calculateRankedChoiceWinner(session);
      return;
    }

    session.votingPhase = 'finalRanking';
    return;
  }

  if (session.votingPhase === 'finalRanking') {
    const remainingMovies = getRemainingMovies(session);
    const allCompleted = eligibleVoters.every(voter => {
      const ranking = hasFinalRanked(session, voter) ? session.finalRankings[voter] : undefined;
      return ranking && isExactMovieSet(ranking, remainingMovies);
    });

    if (allCompleted) {
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
