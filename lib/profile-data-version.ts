import { redis } from '@/lib/redis';

const KEY = 'profile:data_version';

/** Monotonic cache-bust token: increment on any profile mutation (create, delete, bulk import). */
export async function getProfileDataVersion(): Promise<string> {
  const v = await redis.get(KEY);
  return v == null ? '0' : String(v);
}

export async function bumpProfileDataVersion(): Promise<void> {
  await redis.incr(KEY);
}
