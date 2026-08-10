import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  advanceVotingPhaseIfComplete,
  canStartVoting,
  createNominationId,
  getAllMovies,
  getAllMovieNominations,
  getVetoedNominations,
  getRemainingNominations,
  getRemainingMovies,
  hasDuplicateMovieIds,
  isExactMovieSet,
  calculateRankedChoiceWinner,
} from './voting';
import { Session, SessionParticipant } from './types';
import { Movie } from './tmdb';

// Mock console.log to avoid cluttering test output
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

// Helper to create mock movies
const createMovie = (id: number, title: string): Movie => ({
  id,
  title,
  poster_path: `/poster${id}.jpg`,
  release_date: '2024-01-01',
  overview: `Overview for ${title}`,
});

// Helper to create mock participant
const createParticipant = (
  username: string,
  movies: Movie[],
  options?: Partial<SessionParticipant>
): SessionParticipant => ({
  username,
  movies,
  joinedAt: new Date('2024-01-01'),
  ...options,
});

// Helper to create mock session
const createSession = (
  participants: SessionParticipant[],
  options?: Partial<Session>
): Session => ({
  code: 'TEST',
  host: participants[0]?.username || 'host',
  participants,
  createdAt: new Date('2024-01-01'),
  isVotingOpen: false,
  maxParticipants: 8,
  votingPhase: 'ranking',
  ...options,
});

describe('voting.ts', () => {
  describe('canStartVoting', () => {
    it('should return true when all participants have 2+ movies and 2+ participants', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      expect(canStartVoting(session)).toBe(true);
    });

    it('should return false when a participant has less than 2 movies', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      expect(canStartVoting(session)).toBe(false);
    });

    it('should return false when there is only 1 participant', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
      ]);

      expect(canStartVoting(session)).toBe(false);
    });

    it('should return false when there are no participants', () => {
      const session = createSession([]);

      expect(canStartVoting(session)).toBe(false);
    });

    it('should return true when participants have more than 2 movies', () => {
      const session = createSession([
        createParticipant('alice', [
          createMovie(1, 'Movie 1'),
          createMovie(2, 'Movie 2'),
          createMovie(3, 'Movie 3'),
        ]),
        createParticipant('bob', [
          createMovie(4, 'Movie 4'),
          createMovie(5, 'Movie 5'),
          createMovie(6, 'Movie 6'),
        ]),
      ]);

      expect(canStartVoting(session)).toBe(true);
    });

    it('should return false when a participant has duplicate movies in their top 2', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(1, 'Movie 1')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      expect(canStartVoting(session)).toBe(false);
    });
  });

  describe('getAllMovies', () => {
    it('should return unique movies from all participants', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const movies = getAllMovies(session);
      expect(movies).toHaveLength(4);
      expect(movies.map(m => m.id)).toEqual([1, 2, 3, 4]);
    });

    it('should deduplicate movies with same ID', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);

      const movies = getAllMovies(session);
      expect(movies).toHaveLength(3);
      expect(movies.map(m => m.id)).toEqual([1, 2, 3]);
    });

    it('should only take first 2 movies from each participant', () => {
      const session = createSession([
        createParticipant('alice', [
          createMovie(1, 'Movie 1'),
          createMovie(2, 'Movie 2'),
          createMovie(3, 'Movie 3'),
        ]),
        createParticipant('bob', [
          createMovie(4, 'Movie 4'),
          createMovie(5, 'Movie 5'),
          createMovie(6, 'Movie 6'),
        ]),
      ]);

      const movies = getAllMovies(session);
      expect(movies).toHaveLength(4);
      expect(movies.map(m => m.id)).toEqual([1, 2, 4, 5]);
    });
  });

  describe('getAllMovieNominations', () => {
    it('should return nominations with nominatedBy field', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const nominations = getAllMovieNominations(session);
      expect(nominations).toHaveLength(4);
      expect(nominations[0].nominatedBy).toBe('alice');
      expect(nominations[0].nominationId).toBe('1-alice');
      expect(nominations[2].nominatedBy).toBe('bob');
    });

    it('should include duplicate movies with different nominators', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);

      const nominations = getAllMovieNominations(session);
      expect(nominations).toHaveLength(4);
      const movie1Nominations = nominations.filter(n => n.id === 1);
      expect(movie1Nominations).toHaveLength(2);
      expect(movie1Nominations.map(n => n.nominatedBy)).toEqual(['alice', 'bob']);
    });
  });

  describe('getVetoedNominations', () => {
    it('should return vetoed nomination IDs', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '3-bob',
        }),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')], {
          vetoedNominationId: '1-alice',
        }),
      ]);

      const vetoedNominations = getVetoedNominations(session);
      expect(vetoedNominations).toHaveLength(2);
      expect(vetoedNominations).toEqual(['3-bob', '1-alice']);
    });

    it('should return empty array when no nomination vetoes', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const vetoedNominations = getVetoedNominations(session);
      expect(vetoedNominations).toHaveLength(0);
    });
  });

  describe('getRemainingNominations', () => {
    it('should return nominations that have not been vetoed', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '3-bob',
        }),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const remaining = getRemainingNominations(session);
      expect(remaining).toHaveLength(3);
      expect(remaining.find(n => n.nominationId === '3-bob')).toBeUndefined();
    });

    it('should include nominationId field', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
      ]);

      const remaining = getRemainingNominations(session);
      expect(remaining[0].nominationId).toBe('1-alice');
      expect(remaining[1].nominationId).toBe('2-alice');
    });

    it('should remove only the vetoed duplicate nomination', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '1-bob',
        }),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);

      const remaining = getRemainingNominations(session);
      expect(remaining.map(n => n.nominationId)).toEqual(['1-alice', '2-alice', '3-bob']);
    });
  });

  describe('getRemainingMovies', () => {
    it('should return movies that have not been vetoed', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '3-bob',
        }),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const remaining = getRemainingMovies(session);
      expect(remaining).toHaveLength(3);
      expect(remaining.map(m => m.id)).toEqual([1, 2, 4]);
    });

    it('should return all movies when no vetoes', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const remaining = getRemainingMovies(session);
      expect(remaining).toHaveLength(4);
    });

    it('should keep a movie when only one duplicate nomination was vetoed', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '1-bob',
        }),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);

      const remaining = getRemainingMovies(session);
      expect(remaining.map(m => m.id)).toEqual([1, 2, 3]);
    });

    it('should remove a movie only when all of its nominations are vetoed', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '1-bob',
        }),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')], {
          vetoedNominationId: '1-alice',
        }),
      ]);

      const remaining = getRemainingMovies(session);
      expect(remaining.map(m => m.id)).toEqual([2, 3]);
    });
  });

  describe('ranking helpers', () => {
    it('should detect duplicate movie IDs', () => {
      expect(hasDuplicateMovieIds([createMovie(1, 'Movie 1'), createMovie(1, 'Movie 1')])).toBe(true);
      expect(hasDuplicateMovieIds([createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')])).toBe(false);
    });

    it('should validate exact movie sets regardless of order', () => {
      const expected = [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')];

      expect(isExactMovieSet([createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')], expected)).toBe(true);
      expect(isExactMovieSet([createMovie(1, 'Movie 1')], expected)).toBe(false);
      expect(isExactMovieSet([createMovie(1, 'Movie 1'), createMovie(1, 'Movie 1')], expected)).toBe(false);
      expect(isExactMovieSet([createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')], expected)).toBe(false);
    });

    it('should create stable nomination IDs', () => {
      expect(createNominationId(550, 'alice')).toBe('550-alice');
    });
  });

  describe('calculateRankedChoiceWinner', () => {
    it('should declare winner with majority in first round', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
        createParticipant('charlie', [createMovie(1, 'Movie 1'), createMovie(4, 'Movie 4')]),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(1);
      expect(results.eliminatedMovies).toHaveLength(0);
      expect(results.rounds).toHaveLength(1);
    });

    it('should eliminate movies with fewest votes and continue', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')]),
        createParticipant('charlie', [createMovie(3, 'Movie 3'), createMovie(2, 'Movie 2')]),
        createParticipant('dave', [createMovie(4, 'Movie 4'), createMovie(1, 'Movie 1')]),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner).toBeDefined();
      expect(results.eliminatedMovies.length).toBeGreaterThan(0);
      expect(results.rounds.length).toBeGreaterThan(1);
    });

    it('should exclude vetoed nominations from consideration', () => {
      const session = createSession(
        [
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            vetoedNominationId: '3-bob',
            finalMovies: [createMovie(1, 'Movie 1'), createMovie(4, 'Movie 4')],
          }),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')], {
            vetoedNominationId: '2-alice',
            finalMovies: [createMovie(1, 'Movie 1'), createMovie(4, 'Movie 4')],
          }),
        ],
        { votingPhase: 'results' }
      );

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(1);
    });

    it('should calculate with nomination-level vetoes for duplicate nominations', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '1-bob',
          finalMovies: [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2'), createMovie(3, 'Movie 3')],
        }),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')], {
          vetoedNominationId: '2-alice',
          finalMovies: [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')],
        }),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(1);
    });

    it('should use finalMovies when available', () => {
      const session = createSession([
        createParticipant(
          'alice',
          [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')],
          {
            finalMovies: [createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')],
          }
        ),
        createParticipant(
          'bob',
          [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')],
          {
            finalMovies: [createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')],
          }
        ),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(2);
    });

    it('should handle tie-breaking for elimination', () => {
      // Mock Math.random to control tie-breaking
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner).toBeDefined();
      expect(results.tieBreaking).toBeDefined();

      randomSpy.mockRestore();
    });

    it('should handle single movie remaining', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '2-bob',
        }),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedNominationId: '2-alice',
        }),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(1);
      expect(results.eliminatedMovies).toHaveLength(0);
      // When only 1 movie remains after vetoes, the algorithm exits early
      expect(results.rounds.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle complex multi-round scenario', () => {
      const session = createSession([
        createParticipant('alice', [
          createMovie(1, 'Movie 1'),
          createMovie(2, 'Movie 2'),
          createMovie(3, 'Movie 3'),
        ]),
        createParticipant('bob', [
          createMovie(2, 'Movie 2'),
          createMovie(3, 'Movie 3'),
          createMovie(4, 'Movie 4'),
        ]),
        createParticipant('charlie', [
          createMovie(3, 'Movie 3'),
          createMovie(4, 'Movie 4'),
          createMovie(1, 'Movie 1'),
        ]),
        createParticipant('dave', [
          createMovie(4, 'Movie 4'),
          createMovie(1, 'Movie 1'),
          createMovie(2, 'Movie 2'),
        ]),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner).toBeDefined();
      expect(results.rounds.length).toBeGreaterThan(0);
      expect(results.eliminatedMovies.length).toBeGreaterThan(0);
    });

    it('should track eliminated movies in correct order', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(2, 'Movie 2'), createMovie(3, 'Movie 3')]),
        createParticipant('charlie', [createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')]),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.eliminatedMovies).toBeDefined();
      // Each eliminated movie should have appeared in exactly one round's elimination
      const eliminatedInRounds = results.rounds
        .filter(r => r.eliminated)
        .map(r => r.eliminated!.id);
      expect(eliminatedInRounds).toHaveLength(results.eliminatedMovies.length);
    });
  });

  // ============================================
  // Phase Transition Behavior Tests
  // Tests verify behavior using existing src functions
  // ============================================

  describe('Phase Transitions', () => {
    describe('ranking -> vetoing transition', () => {
      it('canStartVoting returns true when ready to transition', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
        ]);

        expect(canStartVoting(session)).toBe(true);
      });

      it('canStartVoting returns false when participant has < 2 movies', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1')]),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
        ]);

        expect(canStartVoting(session)).toBe(false);
      });

      it('canStartVoting returns false with only 1 participant', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        ]);

        expect(canStartVoting(session)).toBe(false);
      });
    });

    describe('vetoing -> finalRanking/results transition', () => {
      it('should have multiple remaining movies after vetoes for finalRanking', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            hasVoted: true,
            vetoedNominationId: '3-bob',
          }),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')], {
            hasVoted: true,
            vetoedNominationId: '1-alice',
          }),
        ]);

        const remaining = getRemainingMovies(session);
        expect(remaining.length).toBeGreaterThan(1);
        expect(remaining.map(m => m.id)).toEqual([2, 4]);
      });

      it('should skip to results when only 1 movie remains after vetoes', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            hasVoted: true,
            vetoedNominationId: '2-bob',
          }),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            hasVoted: true,
            vetoedNominationId: '2-alice',
          }),
        ]);

        const remaining = getRemainingMovies(session);
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe(1);
      });

      it('should never empty the pool when each veto removes one nomination', () => {
        // Each participant contributes 2 nominations and holds 1 veto,
        // so the pool can never be drained to zero
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            hasVoted: true,
            vetoedNominationId: '1-bob',
          }),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            hasVoted: true,
            vetoedNominationId: '2-alice',
          }),
        ]);

        const remaining = getRemainingNominations(session);
        expect(remaining.length).toBeGreaterThan(0);
        expect(remaining.map(n => n.nominationId)).toEqual(['1-alice', '2-bob']);
      });
    });

    describe('finalRanking -> results transition', () => {
      it('calculateRankedChoiceWinner uses finalMovies when available', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            finalMovies: [createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')],
          }),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            finalMovies: [createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')],
          }),
        ]);

        const results = calculateRankedChoiceWinner(session);
        // Both ranked movie 2 first, so it should win
        expect(results.winner.id).toBe(2);
      });

      it('calculateRankedChoiceWinner falls back to movies when no finalMovies', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        ]);

        const results = calculateRankedChoiceWinner(session);
        // Both have movie 1 first, so it should win
        expect(results.winner.id).toBe(1);
      });
    });

    describe('advanceVotingPhaseIfComplete', () => {
      it('does nothing while vetoes are outstanding', () => {
        const session = createSession(
          [
            createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
              hasVoted: true,
              vetoedNominationId: '3-bob',
            }),
            createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
          ],
          { votingPhase: 'vetoing' }
        );

        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('vetoing');
      });

      it('advances vetoing to finalRanking when everyone has vetoed', () => {
        const session = createSession(
          [
            createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
              hasVoted: true,
              vetoedNominationId: '3-bob',
              finalMovies: [createMovie(9, 'Stale')],
            }),
            createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')], {
              hasVoted: true,
              vetoedNominationId: '1-alice',
            }),
          ],
          { votingPhase: 'vetoing' }
        );

        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('finalRanking');
        // finalMovies are reset for the new phase
        expect(session.participants.every(p => p.finalMovies === undefined)).toBe(true);
      });

      it('advances vetoing straight to results when one movie remains', () => {
        const session = createSession(
          [
            createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
              hasVoted: true,
              vetoedNominationId: '2-bob',
            }),
            createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
              hasVoted: true,
              vetoedNominationId: '2-alice',
            }),
          ],
          { votingPhase: 'vetoing' }
        );

        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('results');
        expect(session.votingResults?.winner.id).toBe(1);
      });

      it('advances finalRanking to results when everyone has submitted', () => {
        const remaining = [createMovie(2, 'Movie 2'), createMovie(4, 'Movie 4')];
        const session = createSession(
          [
            createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
              hasVoted: true,
              vetoedNominationId: '3-bob',
              finalMovies: [...remaining],
            }),
            createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')], {
              hasVoted: true,
              vetoedNominationId: '1-alice',
              finalMovies: [...remaining],
            }),
          ],
          { votingPhase: 'finalRanking' }
        );

        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('results');
        expect(session.votingResults?.winner.id).toBe(2);
      });

      it('clears stale finalMovies instead of deadlocking when the pool changed', () => {
        // alice submitted a ranking for a pool that no longer matches
        // (e.g. a participant left mid-finalRanking, changing the pool)
        const session = createSession(
          [
            createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
              hasVoted: true,
              vetoedNominationId: '3-bob',
              finalMovies: [createMovie(2, 'Movie 2'), createMovie(4, 'Movie 4'), createMovie(5, 'Gone')],
            }),
            createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')], {
              hasVoted: true,
              vetoedNominationId: '1-alice',
            }),
          ],
          { votingPhase: 'finalRanking' }
        );

        advanceVotingPhaseIfComplete(session);
        // Phase stays finalRanking, but alice can now resubmit
        expect(session.votingPhase).toBe('finalRanking');
        expect(session.participants[0].finalMovies).toBeUndefined();
      });
    });

    describe('Full voting flow integration', () => {
      it('simulates complete ranking -> vetoing -> finalRanking -> results flow', () => {
        // Phase 1: ranking - verify can start
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
        ]);
        expect(canStartVoting(session)).toBe(true);
        expect(getAllMovies(session)).toHaveLength(4);

        // Phase 2: vetoing - simulate vetoes
        session.participants[0].hasVoted = true;
        session.participants[0].vetoedNominationId = '3-bob';
        session.participants[1].hasVoted = true;
        session.participants[1].vetoedNominationId = '1-alice';

        const remaining = getRemainingMovies(session);
        expect(remaining).toHaveLength(2);
        expect(remaining.map(m => m.id)).toEqual([2, 4]);

        // Phase 3: finalRanking - add final rankings
        session.participants[0].finalMovies = [createMovie(4, 'Movie 4'), createMovie(2, 'Movie 2')];
        session.participants[1].finalMovies = [createMovie(4, 'Movie 4'), createMovie(2, 'Movie 2')];

        // Phase 4: results - calculate winner
        const results = calculateRankedChoiceWinner(session);
        expect(results.winner.id).toBe(4); // Both ranked movie 4 first
      });

      it('simulates flow that skips finalRanking when 1 movie remains', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        ]);

        // Both nominations of movie 2 get vetoed
        session.participants[0].hasVoted = true;
        session.participants[0].vetoedNominationId = '2-bob';
        session.participants[1].hasVoted = true;
        session.participants[1].vetoedNominationId = '2-alice';

        const remaining = getRemainingMovies(session);
        expect(remaining).toHaveLength(1);

        // Should go straight to results
        const results = calculateRankedChoiceWinner(session);
        expect(results.winner.id).toBe(1);
      });
    });
  });
});
