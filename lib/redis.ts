import Redis from 'ioredis';

/**
 * Interface for memory client to match Redis methods we use
 */
interface MemoryClient {
  setex: (key: string, ttl: number, value: string) => Promise<string>;
  get: (key: string) => Promise<string | null>;
  exists: (key: string) => Promise<number>;
  del: (key: string) => Promise<number>;
}

/**
 * Type for Redis client - can be actual Redis or memory fallback
 */
type RedisClient = Redis | MemoryClient;

let redis: Redis | null = null;
let memoryClient: MemoryClient | null = null;

// In-memory fallback for development - make it global to persist across module reloads
declare global {
  var __frameRateMemoryStore: Map<string, string> | undefined;
  var __frameRateHasWarnedAboutMemory: boolean | undefined;
}

const memoryStore = globalThis.__frameRateMemoryStore ?? new Map<string, string>();
if (process.env.NODE_ENV === 'development') {
  globalThis.__frameRateMemoryStore = memoryStore;
}

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
});

export default getRedisClient; 