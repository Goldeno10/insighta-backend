import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient } from "redis";

type RedisSetOpts = { ex?: number };

type RedisLike = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string, opts?: RedisSetOpts): Promise<unknown>;
  lpush(key: string, ...values: string[]): Promise<unknown>;
  incr(key: string): Promise<unknown>;
  del(key: string): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<unknown>;
};

function hasUpstashEnv(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

function hasLocalRedisUrl(): boolean {
  return Boolean(process.env.REDIS_URL);
}

let localClient: ReturnType<typeof createClient> | null = null;

async function getLocalClient(): Promise<ReturnType<typeof createClient>> {
  if (localClient) return localClient;
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("Missing REDIS_URL for local Redis");

  const client = createClient({ url });
  client.on("error", () => {
    // Swallow at this layer; callers should treat redis as best-effort.
  });
  await client.connect();
  localClient = client;
  return client;
}

const localRedis: RedisLike = {
  async get(key) {
    const c = await getLocalClient();
    return await c.get(key);
  },
  async set(key, value, opts) {
    const c = await getLocalClient();
    if (opts?.ex != null) return await c.set(key, value, { EX: opts.ex });
    return await c.set(key, value);
  },
  async lpush(key, ...values) {
    const c = await getLocalClient();
    return await c.lPush(key, values);
  },
  async incr(key) {
    const c = await getLocalClient();
    return await c.incr(key);
  },
  async del(key) {
    const c = await getLocalClient();
    return await c.del(key);
  },
  async lrange(key, start, stop) {
    const c = await getLocalClient();
    return await c.lRange(key, start, stop);
  },
};

export const redis: RedisLike = hasLocalRedisUrl()
  ? localRedis
  : hasUpstashEnv()
    ? UpstashRedis.fromEnv()
    : localRedis;

export const isUpstashRedis = !hasLocalRedisUrl() && hasUpstashEnv();