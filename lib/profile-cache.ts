import { redis } from '@/lib/redis';
import { getProfileDataVersion } from '@/lib/profile-data-version';

const TTL_LIST_SEC = 45;
const TTL_SEARCH_SEC = 45;
const TTL_BY_ID_SEC = 90;

export async function getCachedJson<T>(key: string): Promise<T | null> {
  const raw = await redis.get(key);
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
  return raw as T;
}

export async function setCachedJson(key: string, value: unknown, ttlSec: number): Promise<void> {
  await redis.set(key, JSON.stringify(value), { ex: ttlSec });
}

export async function listProfilesCacheKey(subKey: string): Promise<string> {
  const v = await getProfileDataVersion();
  return `insighta:v${v}:profiles:list:${subKey}`;
}

export async function searchProfilesCacheKey(subKey: string): Promise<string> {
  const v = await getProfileDataVersion();
  return `insighta:v${v}:profiles:search:${subKey}`;
}

export async function profileByIdCacheKey(id: string): Promise<string> {
  const v = await getProfileDataVersion();
  return `insighta:v${v}:profiles:byid:${id}`;
}

export { TTL_LIST_SEC, TTL_SEARCH_SEC, TTL_BY_ID_SEC };
