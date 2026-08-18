import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const inMemoryCache = new Map<string, { value: string; expiresAt?: number }>();

const redisUrl = process.env.REDIS_URL;
const redisHost = process.env.REDIS_HOST || process.env.REDISHOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || process.env.REDISPORT || '6379', 10);
const redisPassword = process.env.REDIS_PASSWORD || process.env.REDISPASSWORD || undefined;
const redisUser = process.env.REDIS_USER || process.env.REDISUSER || undefined;

const options = {
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 5) {
      return null; // Stop retrying after 5 attempts
    }
    return Math.min(times * 200, 2000);
  },
};

export const redis: Redis = redisUrl
  ? new Redis(redisUrl, options)
  : new Redis({
      host: redisHost,
      port: redisPort,
      username: redisUser,
      password: redisPassword,
      ...options,
    });

let isRedisConnected = false;

redis.on('connect', () => {
  console.log('🔄 Connecting to Redis instance...');
});

redis.on('ready', () => {
  isRedisConnected = true;
  console.log('✅ Connected to Redis cache instance successfully.');
});

redis.on('error', (err) => {
  if (isRedisConnected) {
    console.warn('⚠️ Redis connection lost, switching to memory cache fallback.');
  } else {
    console.warn('⚠️ Redis connection error:', err.message);
  }
  isRedisConnected = false;
});

export async function cacheSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const strVal = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    if (isRedisConnected || redis.status === 'ready') {
      if (ttlSeconds) {
        await redis.set(key, strVal, 'EX', ttlSeconds);
      } else {
        await redis.set(key, strVal);
      }
      return;
    }
  } catch (e: any) {
    console.warn(`Redis cacheSet error for key "${key}":`, e.message);
  }

  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
  inMemoryCache.set(key, { value: strVal, expiresAt });
}

export async function cacheGet<T = any>(key: string): Promise<T | null> {
  try {
    if (isRedisConnected || redis.status === 'ready') {
      const val = await redis.get(key);
      if (val) {
        try {
          return JSON.parse(val) as T;
        } catch {
          return val as unknown as T;
        }
      }
      return null;
    }
  } catch (e: any) {
    console.warn(`Redis cacheGet error for key "${key}":`, e.message);
  }

  const cached = inMemoryCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt && Date.now() > cached.expiresAt) {
    inMemoryCache.delete(key);
    return null;
  }
  try {
    return JSON.parse(cached.value) as T;
  } catch {
    return cached.value as unknown as T;
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    if (isRedisConnected || redis.status === 'ready') {
      await redis.del(key);
      return;
    }
  } catch (e: any) {
    console.warn(`Redis cacheDel error for key "${key}":`, e.message);
  }
  inMemoryCache.delete(key);
}
