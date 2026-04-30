import { Redis } from '@upstash/redis';

const redis = Redis.fromEnv();

export async function logRequest(method: string, endpoint: string, statusCode: number, startTime: number) {
  const responseTime = `${Date.now() - startTime}ms`;

  try {
    await redis.lpush('api_request_logs', JSON.stringify({
      method,
      endpoint,
      status_code: statusCode,
      response_time: responseTime,
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    console.error("Failed to push logs to Redis:", err);
  }
}
