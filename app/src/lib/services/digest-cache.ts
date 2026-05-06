/**
 * 共享的 Digest 列表/最新查询内存缓存。
 * 抽到 services 下以便 API route 与 scheduler/generate 都能互访，
 * 避免 Next.js app router 对 route.ts 中额外导出的限制。
 */
interface Entry { data: unknown; ts: number }

const digestCache = new Map<string, Entry>();
export const DIGEST_CACHE_TTL = 300_000;
const MAX_ENTRIES = 50;
const EVICT_COUNT = 10;

export function getDigestCache(key: string): Entry | undefined {
  return digestCache.get(key);
}

export function setDigestCache(key: string, data: unknown): void {
  digestCache.set(key, { data, ts: Date.now() });
  if (digestCache.size > MAX_ENTRIES) {
    const oldest = [...digestCache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < EVICT_COUNT; i++) {
      if (oldest[i]) digestCache.delete(oldest[i][0]);
    }
  }
}

export function invalidateDigestCache(): void {
  digestCache.clear();
}
