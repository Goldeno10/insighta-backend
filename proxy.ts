import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Initialize Redis and Rate Limiter
const redis = Redis.fromEnv();
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(60, '1m'), // 60 requests per minute
});

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  // if (!path.startsWith('/api/profiles')) return NextResponse.next();

  // 1. Rate Limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return NextResponse.json({ status: "error", message: "Rate limit exceeded" }, { status: 429 });
  }

  // 2. Version Check
  const version = req.headers.get('X-API-Version');
  if (version !== '1') {
    return NextResponse.json({ status: "error", message: "API version header required" }, { status: 400 });
  }

  // 3. Auth Check
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return NextResponse.json({ status: "error", message: "Authentication required" }, { status: 401 });

  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const userRole = payload.role as string;
    const userId = payload.userId as string;

    // 4. RBAC
    if (userRole === 'analyst' && (req.method === 'POST' || req.method === 'DELETE')) {
      return NextResponse.json({ status: "error", message: "Forbidden: Admin access required" }, { status: 403 });
    }

    // 5. Request Logging (Using Redis for Edge Compatibility)
    // We store it as a list to process later or keep it in Redis for the dashboard
    await redis.lpush('request_logs', JSON.stringify({
      userId,
      method: req.method,
      path,
      version,
      timestamp: new Date().toISOString()
    }));

    const requestHeaders = new Headers(req.headers);
    requestHeaders.set('x-user-id', userId);
    requestHeaders.set('x-user-role', userRole);

    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch (e) {
    return NextResponse.json({ status: "error", message: "Invalid or expired token" }, { status: 401 });
  }
}

export const config = { matcher: '/api/profiles/:path*' };
