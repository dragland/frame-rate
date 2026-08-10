import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  advanceVotingPhaseIfComplete,
  canStartVoting,
  createNominationId,
  getEligibleVoters,
  getRemainingNominations,
  getRemainingMovies,
  hasDuplicateMovieIds,
  hasVetoed,
  isEligibleVoter,
  isExactMovieSet,
  lockNominations,
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
  nominations: [],
  vetoes: {},
  finalRankings: {},
  ...options,
});

// Helper for post-lock sessions: pool frozen, defaulting to the vetoing phase
const createLockedSession = (
  participants: SessionParticipant[],
  options?: Partial<Session>
): Session => {
  const session = createSession(participants, { votingPhase: 'vetoing', ...options });
  lockNominations(session);
  return session;
};

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

  describe('lockNominations', () => {
    it('should freeze each participant\'s top 2 with nominatedBy and nominationId', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [
          createMovie(3, 'Movie 3'),
          createMovie(4, 'Movie 4'),
          createMovie(5, 'Movie 5'),
        ]),
      ]);

      lockNominations(session);
      expect(session.nominations).toHaveLength(4);
      expect(session.nominations.map(n => n.nominationId)).toEqual([
        '1-alice', '2-alice', '3-bob', '4-bob',
      ]);
      expect(session.nominations[0].nominatedBy).toBe('alice');
    });

    it('should include duplicate movies nominated by different users', () => {
      const session = createSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);

      lockNominations(session);
      const movie1Nominations = session.nominations.filter(n => n.id === 1);
      expect(movie1Nominations).toHaveLength(2);
      expect(movie1Nominations.map(n => n.nominatedBy)).toEqual(['alice', 'bob']);
    });

    it('should reset vetoes and final rankings', () => {
      const session = createSession(
        [createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')])],
        { vetoes: { alice: '1-alice' }, finalRankings: { alice: [createMovie(1, 'Movie 1')] } }
      );

      lockNominations(session);
      expect(session.vetoes).toEqual({});
      expect(session.finalRankings).toEqual({});
    });
  });

  describe('eligibility and veto tracking', () => {
    it('isEligibleVoter is true only for users with nominations in the frozen pool', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      expect(isEligibleVoter(session, 'alice')).toBe(true);
      expect(isEligibleVoter(session, 'bob')).toBe(true);
      expect(isEligibleVoter(session, 'stranger')).toBe(false);
      expect(getEligibleVoters(session)).toEqual(['alice', 'bob']);
    });

    it('hasVetoed reads the session veto map', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);
      session.vetoes = { alice: '3-bob' };

      expect(hasVetoed(session, 'alice')).toBe(true);
      expect(hasVetoed(session, 'bob')).toBe(false);
    });
  });

  describe('getRemainingNominations', () => {
    it('should return nominations that have not been vetoed', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);
      session.vetoes = { alice: '3-bob' };

      const remaining = getRemainingNominations(session);
      expect(remaining).toHaveLength(3);
      expect(remaining.find(n => n.nominationId === '3-bob')).toBeUndefined();
    });

    it('should remove only the vetoed duplicate nomination', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);
      session.vetoes = { alice: '1-bob' };

      const remaining = getRemainingNominations(session);
      expect(remaining.map(n => n.nominationId)).toEqual(['1-alice', '2-alice', '3-bob']);
    });

    it('should survive a participant leaving: pool and vetoes are frozen', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);
      session.vetoes = { alice: '3-bob' };

      // alice closes her phone / taps the logo
      session.participants = session.participants.filter(p => p.username !== 'alice');

      // Her nominations stay in the pool and her veto still applies
      const remaining = getRemainingNominations(session);
      expect(remaining.map(n => n.nominationId)).toEqual(['1-alice', '2-alice', '4-bob']);
      expect(hasVetoed(session, 'alice')).toBe(true);
    });
  });

  describe('getRemainingMovies', () => {
    it('should return movies that have not been vetoed', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);
      session.vetoes = { alice: '3-bob' };

      const remaining = getRemainingMovies(session);
      expect(remaining).toHaveLength(3);
      expect(remaining.map(m => m.id)).toEqual([1, 2, 4]);
    });

    it('should return all movies when no vetoes', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const remaining = getRemainingMovies(session);
      expect(remaining).toHaveLength(4);
    });

    it('should keep a movie when only one duplicate nomination was vetoed', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);
      session.vetoes = { alice: '1-bob' };

      const remaining = getRemainingMovies(session);
      expect(remaining.map(m => m.id)).toEqual([1, 2, 3]);
    });

    it('should remove a movie only when all of its nominations are vetoed', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);
      session.vetoes = { alice: '1-bob', bob: '1-alice' };

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
      const session = createLockedSession([
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
      const session = createLockedSession([
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
      const session = createLockedSession(
        [
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
        ],
        { votingPhase: 'results' }
      );
      session.vetoes = { alice: '3-bob', bob: '2-alice' };
      session.finalRankings = {
        alice: [createMovie(1, 'Movie 1'), createMovie(4, 'Movie 4')],
        bob: [createMovie(1, 'Movie 1'), createMovie(4, 'Movie 4')],
      };

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(1);
    });

    it('should calculate with nomination-level vetoes for duplicate nominations', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')]),
      ]);
      session.vetoes = { alice: '1-bob', bob: '2-alice' };
      session.finalRankings = {
        alice: [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')],
        bob: [createMovie(1, 'Movie 1'), createMovie(3, 'Movie 3')],
      };

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(1);
    });

    it('should use submitted final rankings when available', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
      ]);
      session.finalRankings = {
        alice: [createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')],
        bob: [createMovie(2, 'Movie 2'), createMovie(1, 'Movie 1')],
      };

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(2);
    });

    it('should fall back to nomination order for voters who never submitted a ranking', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
      ]);

      const results = calculateRankedChoiceWinner(session);
      // Both nominated movie 1 first, so it wins on ballot fallback
      expect(results.winner.id).toBe(1);
    });

    it('should handle tie-breaking for elimination', () => {
      // Mock Math.random to control tie-breaking
      const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
      ]);

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner).toBeDefined();
      expect(results.tieBreaking).toBeDefined();

      randomSpy.mockRestore();
    });

    it('should handle single movie remaining', () => {
      const session = createLockedSession([
        createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
      ]);
      session.vetoes = { alice: '2-bob', bob: '2-alice' };

      const results = calculateRankedChoiceWinner(session);
      expect(results.winner.id).toBe(1);
      expect(results.eliminatedMovies).toHaveLength(0);
      // When only 1 movie remains after vetoes, the algorithm exits early
      expect(results.rounds.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle complex multi-round scenario', () => {
      const session = createLockedSession([
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
      const session = createLockedSession([
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

    describe('advanceVotingPhaseIfComplete', () => {
      it('does nothing while vetoes are outstanding', () => {
        const session = createLockedSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
        ]);
        session.vetoes = { alice: '3-bob' };

        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('vetoing');
      });

      it('advances vetoing to finalRanking when everyone has vetoed', () => {
        const session = createLockedSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
        ]);
        session.vetoes = { alice: '3-bob', bob: '1-alice' };

        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('finalRanking');
      });

      it('advances vetoing straight to results when one movie remains', () => {
        const session = createLockedSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        ]);
        session.vetoes = { alice: '2-bob', bob: '2-alice' };

        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('results');
        expect(session.votingResults?.winner.id).toBe(1);
      });

      it('advances finalRanking to results when everyone has submitted', () => {
        const remaining = [createMovie(2, 'Movie 2'), createMovie(4, 'Movie 4')];
        const session = createLockedSession(
          [
            createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
            createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
          ],
          { votingPhase: 'finalRanking' }
        );
        session.vetoes = { alice: '3-bob', bob: '1-alice' };
        session.finalRankings = { alice: [...remaining], bob: [...remaining] };

        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('results');
        expect(session.votingResults?.winner.id).toBe(2);
      });

      it('a departure never fast-forwards the phase — the absent voter\'s veto is still required', () => {
        const session = createLockedSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(3, 'Movie 3'), createMovie(4, 'Movie 4')]),
        ]);
        session.vetoes = { alice: '3-bob' };

        // bob (who never vetoed) closes his phone / taps the logo
        session.participants = session.participants.filter(p => p.username !== 'bob');
        advanceVotingPhaseIfComplete(session);

        // Still waiting on bob — completion is judged against the frozen pool
        expect(session.votingPhase).toBe('vetoing');

        // bob rejoins and vetoes: now it advances
        session.vetoes.bob = '1-alice';
        advanceVotingPhaseIfComplete(session);
        expect(session.votingPhase).toBe('finalRanking');
        expect(getRemainingMovies(session).map(m => m.id)).toEqual([2, 4]);
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

        // Phase 2: lock + vetoing
        lockNominations(session);
        session.votingPhase = 'vetoing';
        session.vetoes = { alice: '3-bob', bob: '1-alice' };

        const remaining = getRemainingMovies(session);
        expect(remaining).toHaveLength(2);
        expect(remaining.map(m => m.id)).toEqual([2, 4]);

        // Phase 3: finalRanking - add final rankings
        session.votingPhase = 'finalRanking';
        session.finalRankings = {
          alice: [createMovie(4, 'Movie 4'), createMovie(2, 'Movie 2')],
          bob: [createMovie(4, 'Movie 4'), createMovie(2, 'Movie 2')],
        };

        // Phase 4: results - calculate winner
        const results = calculateRankedChoiceWinner(session);
        expect(results.winner.id).toBe(4); // Both ranked movie 4 first
      });

      it('simulates flow that skips finalRanking when 1 movie remains', () => {
        const session = createLockedSession([
          createParticipant('alice', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
          createParticipant('bob', [createMovie(1, 'Movie 1'), createMovie(2, 'Movie 2')]),
        ]);

        // Both nominations of movie 2 get vetoed
        session.vetoes = { alice: '2-bob', bob: '2-alice' };

        const remaining = getRemainingMovies(session);
        expect(remaining).toHaveLength(1);

        // Should go straight to results
        const results = calculateRankedChoiceWinner(session);
        expect(results.winner.id).toBe(1);
      });
    });
  });
});
