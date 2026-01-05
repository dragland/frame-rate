import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import {
  atomicSessionUpdate,
  atomicSessionCreate,
  getSessionEmitter,
  publishSessionUpdate,
  subscribeToSession,
} from './redis';
import { Session, SessionParticipant } from './types';

// Ensure we're in development mode to use memory fallback
process.env.NODE_ENV = 'development';
delete process.env.REDIS_URL;
delete process.env.REDISCLOUD_URL;

// Clear global state before each test
beforeEach(() => {
  if (globalThis.__frameRateMemoryStore) {
    globalThis.__frameRateMemoryStore.clear();
  }
  if (globalThis.__frameRateMemoryLocks) {
    globalThis.__frameRateMemoryLocks.clear();
  }
  if (globalThis.__frameRateSessionEmitter) {
    globalThis.__frameRateSessionEmitter.removeAllListeners();
  }
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Helper to create a test session
const createTestSession = (code: string = 'TEST'): Session => ({
  code,
  host: 'alice',
  participants: [
    {
      username: 'alice',
      movies: [],
      joinedAt: new Date('2024-01-01'),
    },
  ],
  createdAt: new Date('2024-01-01'),
  expiresAt: new Date('2024-01-02'),
  isVotingOpen: false,
  maxParticipants: 8,
  votingPhase: 'ranking',
});

describe('redis.ts - Memory Fallback Mode', () => {
  describe('getSessionEmitter', () => {
    it('should return an EventEmitter instance', () => {
      const emitter = getSessionEmitter();
      expect(emitter).toBeInstanceOf(EventEmitter);
    });

    it('should return the same instance on multiple calls', () => {
      const emitter1 = getSessionEmitter();
      const emitter2 = getSessionEmitter();
      expect(emitter1).toBe(emitter2);
    });

    it('should support multiple listeners', () => {
      const emitter = getSessionEmitter();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      emitter.on('test-event', listener1);
      emitter.on('test-event', listener2);
      emitter.emit('test-event', 'data');

      expect(listener1).toHaveBeenCalledWith('data');
      expect(listener2).toHaveBeenCalledWith('data');
    });
  });

  describe('atomicSessionCreate', () => {
    it('should create a session when code does not exist', async () => {
      const session = createTestSession('NEW1');
      const created = await atomicSessionCreate('NEW1', session, 3600);

      expect(created).toBe(true);
    });

    it('should fail to create session when code already exists', async () => {
      const session = createTestSession('DUP1');

      const created1 = await atomicSessionCreate('DUP1', session, 3600);
      expect(created1).toBe(true);

      const created2 = await atomicSessionCreate('DUP1', session, 3600);
      expect(created2).toBe(false);
    });

    it('should store session data that can be retrieved', async () => {
      const session = createTestSession('RETR');
      await atomicSessionCreate('RETR', session, 3600);

      // Verify by retrieving it via atomicSessionUpdate
      const retrieved = await atomicSessionUpdate('RETR', 3600, (s) => s);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.code).toBe('RETR');
      expect(retrieved?.host).toBe('alice');
    });
  });

  describe('atomicSessionUpdate', () => {
    it('should update an existing session', async () => {
      const session = createTestSession('UPD1');
      await atomicSessionCreate('UPD1', session, 3600);

      const updated = await atomicSessionUpdate('UPD1', 3600, (s) => {
        return { ...s, isVotingOpen: true };
      });

      expect(updated).not.toBeNull();
      expect(updated?.isVotingOpen).toBe(true);
    });

    it('should return null for non-existent session', async () => {
      const updated = await atomicSessionUpdate('NOEXIST', 3600, (s) => {
        return { ...s, isVotingOpen: true };
      });

      expect(updated).toBeNull();
    });

    it('should allow modifier to abort update by returning null', async () => {
      const session = createTestSession('ABT1');
      await atomicSessionCreate('ABT1', session, 3600);

      const updated = await atomicSessionUpdate('ABT1', 3600, () => null);

      expect(updated).toBeNull();

      // Original session should remain unchanged
      const store = globalThis.__frameRateMemoryStore;
      const storedData = store?.get('session:ABT1');
      if (storedData) {
        const parsed: Session = JSON.parse(storedData);
        expect(parsed.isVotingOpen).toBe(false);
      }
    });

    it('should handle concurrent updates with mutex', async () => {
      const session = createTestSession('CONC');
      await atomicSessionCreate('CONC', session, 3600);

      const updates = await Promise.all([
        atomicSessionUpdate('CONC', 3600, (s) => ({
          ...s,
          participants: [
            ...s.participants,
            {
              username: 'bob',
              movies: [],
              joinedAt: new Date('2024-01-01'),
            },
          ],
        })),
        atomicSessionUpdate('CONC', 3600, (s) => ({
          ...s,
          participants: [
            ...s.participants,
            {
              username: 'charlie',
              movies: [],
              joinedAt: new Date('2024-01-01'),
            },
          ],
        })),
      ]);

      // Both updates should succeed
      expect(updates[0]).not.toBeNull();
      expect(updates[1]).not.toBeNull();

      // Final state should have both participants
      const final = await atomicSessionUpdate('CONC', 3600, (s) => s);
      expect(final?.participants.length).toBe(3);
    });

    it('should preserve session structure during update', async () => {
      const session = createTestSession('PRES');
      await atomicSessionCreate('PRES', session, 3600);

      const updated = await atomicSessionUpdate('PRES', 3600, (s) => ({
        ...s,
        votingPhase: 'locked' as const,
      }));

      expect(updated).not.toBeNull();
      expect(updated?.code).toBe('PRES');
      expect(updated?.host).toBe('alice');
      expect(updated?.votingPhase).toBe('locked');
      expect(updated?.participants).toHaveLength(1);
    });

    it('should handle complex participant updates', async () => {
      const session = createTestSession('PART');
      await atomicSessionCreate('PART', session, 3600);

      // Add a participant
      const updated1 = await atomicSessionUpdate('PART', 3600, (s) => ({
        ...s,
        participants: [
          ...s.participants,
          {
            username: 'bob',
            movies: [
              {
                id: 1,
                title: 'Test Movie',
                poster_path: '/test.jpg',
                release_date: '2024-01-01',
                overview: 'Test',
              },
            ],
            joinedAt: new Date('2024-01-01'),
          },
        ],
      }));

      expect(updated1?.participants).toHaveLength(2);

      // Update a participant's movies
      const updated2 = await atomicSessionUpdate('PART', 3600, (s) => ({
        ...s,
        participants: s.participants.map((p) =>
          p.username === 'bob'
            ? { ...p, vetoedMovieId: 1 }
            : p
        ),
      }));

      expect(updated2?.participants.find((p) => p.username === 'bob')?.vetoedMovieId).toBe(1);
    });
  });

  describe('publishSessionUpdate', () => {
    it('should emit session update to EventEmitter in memory mode', async () => {
      const session = createTestSession('PUB1');
      const emitter = getSessionEmitter();
      const listener = vi.fn();

      emitter.on('session:PUB1', listener);
      await publishSessionUpdate('PUB1', session);

      expect(listener).toHaveBeenCalledTimes(1);
      const receivedData = listener.mock.calls[0][0];
      const parsed = JSON.parse(receivedData);
      expect(parsed.code).toBe('PUB1');
    });

    it('should broadcast to multiple listeners', async () => {
      const session = createTestSession('MULTI');
      const emitter = getSessionEmitter();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      emitter.on('session:MULTI', listener1);
      emitter.on('session:MULTI', listener2);
      emitter.on('session:MULTI', listener3);

      await publishSessionUpdate('MULTI', session);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should serialize session data correctly', async () => {
      const session = createTestSession('SER1');
      session.participants.push({
        username: 'bob',
        movies: [
          {
            id: 100,
            title: 'Test Movie',
            poster_path: '/test.jpg',
            release_date: '2024-01-01',
            overview: 'Test overview',
          },
        ],
        joinedAt: new Date('2024-01-01'),
        vetoedMovieId: 50,
      });

      const emitter = getSessionEmitter();
      const listener = vi.fn();

      emitter.on('session:SER1', listener);
      await publishSessionUpdate('SER1', session);

      const receivedData = listener.mock.calls[0][0];
      const parsed: Session = JSON.parse(receivedData);

      expect(parsed.participants).toHaveLength(2);
      expect(parsed.participants[1].username).toBe('bob');
      expect(parsed.participants[1].vetoedMovieId).toBe(50);
      expect(parsed.participants[1].movies[0].id).toBe(100);
    });
  });

  describe('subscribeToSession', () => {
    it('should not throw error in memory mode', async () => {
      await expect(subscribeToSession('SUB1')).resolves.not.toThrow();
    });

    it('should be idempotent', async () => {
      await subscribeToSession('SUB2');
      await subscribeToSession('SUB2');
      // Should not throw or cause issues
    });
  });

  describe('Integration: Create -> Update -> Publish flow', () => {
    it('should support full session lifecycle', async () => {
      const emitter = getSessionEmitter();
      const listener = vi.fn();
      const sessionCode = 'LIFE';

      // Subscribe to updates
      emitter.on(`session:${sessionCode}`, listener);
      await subscribeToSession(sessionCode);

      // Create session
      const session = createTestSession(sessionCode);
      const created = await atomicSessionCreate(sessionCode, session, 3600);
      expect(created).toBe(true);

      // Publish initial state
      await publishSessionUpdate(sessionCode, session);
      expect(listener).toHaveBeenCalledTimes(1);

      // Update session
      const updated = await atomicSessionUpdate(sessionCode, 3600, (s) => ({
        ...s,
        isVotingOpen: true,
      }));
      expect(updated?.isVotingOpen).toBe(true);

      // Publish update
      if (updated) {
        await publishSessionUpdate(sessionCode, updated);
      }
      expect(listener).toHaveBeenCalledTimes(2);

      // Verify final state
      const finalState = await atomicSessionUpdate(sessionCode, 3600, (s) => s);
      expect(finalState?.isVotingOpen).toBe(true);
    });

    it('should handle multiple sessions independently', async () => {
      const session1 = createTestSession('IND1');
      const session2 = createTestSession('IND2');

      await atomicSessionCreate('IND1', session1, 3600);
      await atomicSessionCreate('IND2', session2, 3600);

      const updated1 = await atomicSessionUpdate('IND1', 3600, (s) => ({
        ...s,
        isVotingOpen: true,
      }));

      const updated2 = await atomicSessionUpdate('IND2', 3600, (s) => ({
        ...s,
        votingPhase: 'vetoing' as const,
      }));

      expect(updated1?.isVotingOpen).toBe(true);
      expect(updated1?.votingPhase).toBe('ranking');
      expect(updated2?.isVotingOpen).toBe(false);
      expect(updated2?.votingPhase).toBe('vetoing');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle empty participant list', async () => {
      const session: Session = {
        code: 'EMPTY',
        host: 'alice',
        participants: [],
        createdAt: new Date(),
        expiresAt: new Date(),
        isVotingOpen: false,
        maxParticipants: 8,
        votingPhase: 'ranking',
      };

      await atomicSessionCreate('EMPTY', session, 3600);
      const retrieved = await atomicSessionUpdate('EMPTY', 3600, (s) => s);
      expect(retrieved?.participants).toHaveLength(0);
    });

    it('should handle session with voting results', async () => {
      const session = createTestSession('RESULT');
      session.votingPhase = 'results';
      session.votingResults = {
        winner: {
          id: 1,
          title: 'Winner',
          poster_path: '/winner.jpg',
          release_date: '2024-01-01',
          overview: 'Winner movie',
        },
        eliminatedMovies: [],
        rounds: [
          {
            round: 1,
            votes: { 1: 2 },
          },
        ],
      };

      await atomicSessionCreate('RESULT', session, 3600);
      const retrieved = await atomicSessionUpdate('RESULT', 3600, (s) => s);

      expect(retrieved?.votingResults).toBeDefined();
      expect(retrieved?.votingResults?.winner.id).toBe(1);
    });

    it('should handle deeply nested participant data', async () => {
      const session = createTestSession('DEEP');
      session.participants[0].movies = [
        {
          id: 1,
          title: 'Movie 1',
          poster_path: '/1.jpg',
          release_date: '2024-01-01',
          overview: 'Overview 1',
        },
        {
          id: 2,
          title: 'Movie 2',
          poster_path: '/2.jpg',
          release_date: '2024-01-02',
          overview: 'Overview 2',
        },
      ];
      session.participants[0].finalMovies = [
        {
          id: 2,
          title: 'Movie 2',
          poster_path: '/2.jpg',
          release_date: '2024-01-02',
          overview: 'Overview 2',
        },
        {
          id: 1,
          title: 'Movie 1',
          poster_path: '/1.jpg',
          release_date: '2024-01-01',
          overview: 'Overview 1',
        },
      ];

      await atomicSessionCreate('DEEP', session, 3600);
      const retrieved = await atomicSessionUpdate('DEEP', 3600, (s) => s);

      expect(retrieved?.participants[0].movies).toHaveLength(2);
      expect(retrieved?.participants[0].finalMovies).toHaveLength(2);
      expect(retrieved?.participants[0].finalMovies?.[0].id).toBe(2);
    });
  });
});
