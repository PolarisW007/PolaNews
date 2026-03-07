import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    redis.connect().catch(e => {
      console.warn('[Redis] Connection failed, caching disabled:', e.message);
    });
  }
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const r = getRedis();
    const val = await r.get(key);
    return val ? JSON.parse(val) as T : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
  try {
    const r = getRedis();
    await r.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch { /* ignore */ }
}

export async function cacheDel(pattern: string): Promise<void> {
  try {
    const r = getRedis();
    const keys = await r.keys(pattern);
    if (keys.length > 0) await r.del(...keys);
  } catch { /* ignore */ }
}
