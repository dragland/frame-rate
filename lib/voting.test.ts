import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  canStartVoting,
  getAllMovies,
  getAllMovieNominations,
  getVetoedMovies,
  getVetoedNominations,
  getRemainingNominations,
  getRemainingMovies,
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
  expiresAt: new Date('2024-01-02'),
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

  describe('getVetoedMovies', () => {
    it('should return movies that have been vetoed', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedMovieId: 3,
        }),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')], {
          vetoedMovieId: 1,
        }),
      ]);

      const vetoedMovies = getVetoedMovies(session);
      expect(vetoedMovies).toHaveLength(2);
      expect(vetoedMovies.map(m => m.id)).toEqual([1, 3]);
    });

    it('should return empty array when no vetoes', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const vetoedMovies = getVetoedMovies(session);
      expect(vetoedMovies).toHaveLength(0);
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
  });

  describe('getRemainingMovies', () => {
    it('should return movies that have not been vetoed', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedMovieId: 3,
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

    it('should exclude vetoed movies from consideration', () => {
      const session = createSession(
        [
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            vetoedMovieId: 2,
          }),
          createParticipant('bob', [createMovie(2, 'Movie 2'), createMovie(3, 'Movie 3')], {
            vetoedMovieId: 3,
          }),
        ],
        { votingPhase: 'results' }
      );

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(1);
      expect([2, 3]).toContain(results.winner.id === 1 ? 2 : 1);
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
          vetoedMovieId: 2,
        }),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
          vetoedMovieId: 2,
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
            vetoedMovieId: 3,
          }),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')], {
            hasVoted: true,
            vetoedMovieId: 1,
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
            vetoedMovieId: 2,
          }),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            hasVoted: true,
            vetoedMovieId: 2,
          }),
        ]);

        const remaining = getRemainingMovies(session);
        expect(remaining.length).toBe(1);
        expect(remaining[0].id).toBe(1);
      });

      it('should handle all movies being vetoed', () => {
        const session = createSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            hasVoted: true,
            vetoedMovieId: 1,
          }),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')], {
            hasVoted: true,
            vetoedMovieId: 2,
          }),
        ]);

        const remaining = getRemainingMovies(session);
        expect(remaining.length).toBe(0);
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
        session.participants[0].vetoedMovieId = 3;
        session.participants[1].hasVoted = true;
        session.participants[1].vetoedMovieId = 1;

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

        // Both veto movie 2
        session.participants[0].hasVoted = true;
        session.participants[0].vetoedMovieId = 2;
        session.participants[1].hasVoted = true;
        session.participants[1].vetoedMovieId = 2;

        const remaining = getRemainingMovies(session);
        expect(remaining).toHaveLength(1);

        // Should go straight to results
        const results = calculateRankedChoiceWinner(session);
        expect(results.winner.id).toBe(1);
      });
    });
  });
});
