import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || 'localhost';
const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);

const inMemoryCache = new Map<string, { value: string; expiresAt?: number }>();

export const redis = new Redis({
  host: redisHost,
  port: redisPort,
  retryStrategy: (times) => {
    if (times > 3) {
      return null; // Stop retrying after 3 attempts
    }
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
});

let isRedisConnected = false;

redis.on('connect', () => {
  isRedisConnected = true;
  console.log('✅ Connected to Redis cache instance.');
});

redis.on('error', (err) => {
  if (isRedisConnected) {
    console.warn('Redis connection lost, switching to memory cache fallback.');
  }
  isRedisConnected = false;
});

export async function cacheSet(key: string, value: any, ttlSeconds?: number): Promise<void> {
  const strVal = typeof value === 'string' ? value : JSON.stringify(value);
  try {
    if (isRedisConnected && redis.status === 'ready') {
      if (ttlSeconds) {
        await redis.set(key, strVal, 'EX', ttlSeconds);
      } else {
        await redis.set(key, strVal);
      }
      return;
    }
  } catch (e) {}

  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
  inMemoryCache.set(key, { value: strVal, expiresAt });
}

export async function cacheGet<T = any>(key: string): Promise<T | null> {
  try {
    if (isRedisConnected && redis.status === 'ready') {
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
  } catch (e) {}

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
    if (isRedisConnected && redis.status === 'ready') {
      await redis.del(key);
      return;
    }
  } catch (e) {}
  inMemoryCache.delete(key);
}
