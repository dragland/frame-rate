import Redis from 'ioredis';
import { EventEmitter } from 'events';
import { Session } from './types';

/**
 * Interface for memory client to match Redis methods we use
 */
interface MemoryClient {
  setex: (key: string, ttl: number, value: string) => Promise<string>;
  get: (key: string) => Promise<string | null>;
  exists: (key: string) => Promise<number>;
  del: (key: string) => Promise<number>;
  setnx: (key: string, value: string) => Promise<number>;
}

/** Max retries for optimistic locking before giving up */
const MAX_ATOMIC_RETRIES = 5;

/**
 * Type for Redis client - can be actual Redis or memory fallback
 */
type RedisClient = Redis | MemoryClient;

let redis: Redis | null = null;
let subscriber: Redis | null = null;
let memoryClient: MemoryClient | null = null;

// In-memory fallback for development - make it global to persist across module reloads
declare global {
  var __frameRateMemoryStore: Map<string, string> | undefined;
  var __frameRateHasWarnedAboutMemory: boolean | undefined;
  var __frameRateSessionEmitter: EventEmitter | undefined;
  var __frameRateMemoryLocks: Map<string, Promise<void>> | undefined;
}

const memoryStore = globalThis.__frameRateMemoryStore ?? new Map<string, string>();
if (process.env.NODE_ENV === 'development') {
  globalThis.__frameRateMemoryStore = memoryStore;
}

// Simple mutex for memory store atomicity in dev
const memoryLocks = globalThis.__frameRateMemoryLocks ?? new Map<string, Promise<void>>();
if (process.env.NODE_ENV === 'development') {
  globalThis.__frameRateMemoryLocks = memoryLocks;
}

/**
 * Shared EventEmitter for pub/sub fan-out
 * Used by both Redis subscriber and memory fallback
 * Single subscriber + EventEmitter = unlimited SSE clients without hitting connection limits
 */
const sessionEmitter = globalThis.__frameRateSessionEmitter ?? new EventEmitter();
sessionEmitter.setMaxListeners(100); // Support 100 concurrent SSE clients
if (process.env.NODE_ENV === 'development') {
  globalThis.__frameRateSessionEmitter = sessionEmitter;
}

/**
 * Get the shared session EventEmitter for SSE handlers
 */
export const getSessionEmitter = (): EventEmitter => sessionEmitter;

/**
 * Track which channels we're subscribed to (to avoid duplicate subscriptions)
 */
const subscribedChannels = new Set<string>();

/**
 * Get or create the shared Redis subscriber connection
 * Separate from command client (ioredis requirement for pub/sub)
 */
export const getRedisSubscriber = (): Redis | null => {
  const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
  if (!redisUrl) return null;

  if (!subscriber) {
    console.log('🔔 Redis: Creating subscriber connection');
    subscriber = new Redis(redisUrl, {
      maxRetriesPerRequest: null, // Required for subscriber
      enableReadyCheck: false,
    });

    subscriber.on('message', (channel: string, message: string) => {
      // Fan out to all SSE clients listening on this channel
      sessionEmitter.emit(channel, message);
    });

    subscriber.on('error', (err) => {
      console.error('❌ Redis subscriber error:', err);
    });

    subscriber.on('connect', () => {
      console.log('✅ Redis subscriber: Connected');
    });
  }

  return subscriber;
};

/**
 * Subscribe to a session channel
 * Uses shared subscriber - only subscribes once per channel
 */
export const subscribeToSession = async (sessionCode: string): Promise<void> => {
  const channel = `session:${sessionCode}`;

  const sub = getRedisSubscriber();
  if (sub && !subscribedChannels.has(channel)) {
    await sub.subscribe(channel);
    subscribedChannels.add(channel);
    console.log(`📡 Subscribed to ${channel}`);
  }
  // Memory fallback: no-op, publishSessionUpdate emits directly
};

/**
 * Unsubscribe from a session channel when no listeners remain
 */
export const unsubscribeFromSession = async (sessionCode: string): Promise<void> => {
  const channel = `session:${sessionCode}`;
  const listenerCount = sessionEmitter.listenerCount(channel);

  if (listenerCount === 0 && subscribedChannels.has(channel)) {
    const sub = getRedisSubscriber();
    if (sub) {
      await sub.unsubscribe(channel);
      subscribedChannels.delete(channel);
      console.log(`📡 Unsubscribed from ${channel}`);
    }
  }
};

/**
 * Publish a session update to all SSE clients
 * Call this after every setex() in mutation routes
 */
export const publishSessionUpdate = async (
  sessionCode: string,
  session: Session
): Promise<void> => {
  const channel = `session:${sessionCode}`;
  const message = JSON.stringify(session);

  const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL;

  if (redisUrl) {
    // Use command client for publishing (safe in ioredis)
    const client = getRedisClient() as Redis;
    await client.publish(channel, message);
  } else {
    // Memory fallback: emit directly to EventEmitter
    sessionEmitter.emit(channel, message);
  }
};

const getRedisClient = (): RedisClient => {
  const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
  const nodeEnv = process.env.NODE_ENV;

  // If no Redis URL in development, use in-memory storage
  if (!redisUrl && nodeEnv === 'development') {
    if (!globalThis.__frameRateHasWarnedAboutMemory) {
      console.log('⚠️  No Redis URL found. Using in-memory storage for development.');
      console.log('💡 To test with Redis: docker run -d -p 6379:6379 redis:alpine');
      console.log('💡 Then set: REDIS_URL=redis://localhost:6379');
      globalThis.__frameRateHasWarnedAboutMemory = true;
    }
    if (!memoryClient) {
      memoryClient = createMemoryClient();
    }
    return memoryClient;
  }

  if (!redisUrl) {
    throw new Error(`Redis URL not configured. Set REDIS_URL environment variable. (NODE_ENV: ${nodeEnv})`);
  }

  if (!redis) {
    console.log(`🚀 Redis: Connecting to ${redisUrl.replace(/\/\/.*@/, '//***@')}`);
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    redis.on('error', (err: Error) => {
      console.error('❌ Redis connection error:', err);
    });

    redis.on('connect', () => {
      console.log('✅ Redis: Connected successfully');
    });
  }

  return redis;
};

/**
 * Creates a memory client for development fallback
 * Implements a subset of Redis interface using a Map
 */
const createMemoryClient = (): MemoryClient => ({
  async setex(key: string, ttl: number, value: string): Promise<string> {
    memoryStore.set(key, value);
    // TTL is ignored in memory store for simplicity in development
    return 'OK';
  },

  async get(key: string): Promise<string | null> {
    return memoryStore.get(key) || null;
  },

  async exists(key: string): Promise<number> {
    return memoryStore.has(key) ? 1 : 0;
  },

  async del(key: string): Promise<number> {
    const existed = memoryStore.has(key);
    memoryStore.delete(key);
    return existed ? 1 : 0;
  },

  async setnx(key: string, value: string): Promise<number> {
    if (memoryStore.has(key)) {
      return 0; // Key exists, not set
    }
    memoryStore.set(key, value);
    return 1; // Key set successfully
  },
});

/**
 * Get the raw ioredis client for advanced operations (WATCH/MULTI/EXEC)
 * Returns null if using memory fallback
 */
export const getRawRedisClient = (): Redis | null => {
  const redisUrl = process.env.REDIS_URL || process.env.REDISCLOUD_URL;
  if (!redisUrl) return null;

  // Ensure client is initialized
  getRedisClient();
  return redis;
};

/**
 * Atomically update a session using optimistic locking
 * Uses WATCH/MULTI/EXEC for Redis, mutex for memory fallback
 *
 * @param sessionCode - The session code (without 'session:' prefix)
 * @param ttl - TTL in seconds for the session
 * @param modifier - Function that takes current session and returns the modified
 *   session, null to abort, or 'delete' to atomically delete the session (the
 *   DEL runs inside the same optimistic lock, so a concurrent write retries
 *   instead of being clobbered)
 * @returns The modified session, 'deleted' if the modifier requested deletion,
 *   or null if modifier returned null or session doesn't exist
 * @throws Error if max retries exceeded (concurrent modification conflict)
 */
export function atomicSessionUpdate(
  sessionCode: string,
  ttl: number,
  modifier: (session: Session) => Session | null
): Promise<Session | null>;
export function atomicSessionUpdate(
  sessionCode: string,
  ttl: number,
  modifier: (session: Session) => Session | null | 'delete'
): Promise<Session | null | 'deleted'>;
export async function atomicSessionUpdate(
  sessionCode: string,
  ttl: number,
  modifier: (session: Session) => Session | null | 'delete'
): Promise<Session | null | 'deleted'> {
  const key = `session:${sessionCode}`;
  const rawRedis = getRawRedisClient();

  if (rawRedis) {
    // Redis: Use WATCH/MULTI/EXEC for optimistic locking
    for (let attempt = 0; attempt < MAX_ATOMIC_RETRIES; attempt++) {
      await rawRedis.watch(key);

      const data = await rawRedis.get(key);
      if (!data) {
        await rawRedis.unwatch();
        return null;
      }

      const session: Session = JSON.parse(data);

      let modified: Session | null | 'delete';
      try {
        modified = modifier(session);
      } catch (error) {
        // Release the WATCH so a dangling watch can't abort the next
        // unrelated transaction on this shared connection
        await rawRedis.unwatch().catch(() => {});
        throw error;
      }

      if (modified === null) {
        await rawRedis.unwatch();
        return null;
      }

      const multi = rawRedis.multi();
      if (modified === 'delete') {
        multi.del(key);
      } else {
        multi.setex(key, ttl, JSON.stringify(modified));
      }
      const result = await multi.exec();

      if (result !== null) {
        // Success - transaction committed
        return modified === 'delete' ? 'deleted' : modified;
      }
      // result === null means WATCH detected a change, retry
      console.log(`⚠️ Atomic update conflict on ${key}, retry ${attempt + 1}/${MAX_ATOMIC_RETRIES}`);
    }

    throw new Error(`Atomic update failed after ${MAX_ATOMIC_RETRIES} retries - too much contention on ${key}`);
  } else {
    // Memory fallback: Use simple mutex
    // Wait for any existing lock on this key
    const existingLock = memoryLocks.get(key);
    if (existingLock) {
      await existingLock;
    }

    // Create our lock
    let releaseLock: () => void;
    const lockPromise = new Promise<void>(resolve => {
      releaseLock = resolve;
    });
    memoryLocks.set(key, lockPromise);

    try {
      const data = memoryStore.get(key);
      if (!data) {
        return null;
      }

      const session: Session = JSON.parse(data);
      const modified = modifier(session);

      if (modified === null) {
        return null;
      }

      if (modified === 'delete') {
        memoryStore.delete(key);
        return 'deleted';
      }

      memoryStore.set(key, JSON.stringify(modified));
      return modified;
    } finally {
      memoryLocks.delete(key);
      releaseLock!();
    }
  }
};

/**
 * Atomically create a session with a unique code using SETNX
 * Prevents race condition where two creates get the same code
 *
 * @param code - The session code to claim
 * @param session - The session data
 * @param ttl - TTL in seconds
 * @returns true if created, false if code already exists
 */
export const atomicSessionCreate = async (
  code: string,
  session: Session,
  ttl: number
): Promise<boolean> => {
  const key = `session:${code}`;
  const rawRedis = getRawRedisClient();
  const value = JSON.stringify(session);

  if (rawRedis) {
    // Redis: Use SET NX EX for atomic create-if-not-exists with TTL
    const result = await rawRedis.set(key, value, 'EX', ttl, 'NX');
    return result === 'OK';
  } else {
    // Memory fallback
    const client = getRedisClient() as MemoryClient;
    const created = await client.setnx(key, value);
    return created === 1;
  }
};

export default getRedisClient;
