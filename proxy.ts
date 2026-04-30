import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

// Initialize Redis and Rate Limiters
const redis = Redis.fromEnv();
const ratelimit = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(60, '1m'), 
});

const authRates = new Ratelimit({
  redis: redis,
  limiter: Ratelimit.slidingWindow(10, '1m') // 10 auth attempts per minute
});

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // 2. Extract client IP safely
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || '127.0.0.1';

  // 3. Auth Rate Limiting (Intercepts paths containing 'auth')
  if (path.includes('/auth')) {
    const { success: authSuccess } = await authRates.limit(ip);
    if (!authSuccess) {
      return NextResponse.json({ status: "error", message: "Auth rate limit exceeded" }, { status: 429 });
    }
  }

  // If it's an auth route, let it pass after the rate limit check
  if (path.includes('/auth')) {
    return NextResponse.next();
  }

  // 4. API Rate Limiting for all other API routes
  if (path.startsWith('/api/')) {
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return NextResponse.json({ status: "error", message: "API rate limit exceeded" }, { status: 429 });
    }


    // 5. Version Check
    const version = req.headers.get('X-API-Version');
    if (version !== '1') {
      return NextResponse.json({ status: "error", message: "API version header required" }, { status: 400 });
    }

    // 6. Auth Check
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ status: "error", message: "Authentication required" }, { status: 401 });

    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      const { payload } = await jwtVerify(token, secret);
      const userRole = payload.role as string;
      const userId = payload.userId as string;

      // 7. Role-Based Access Control (RBAC)
      if (userRole === 'analyst' && (req.method === 'POST' || req.method === 'DELETE')) {
        return NextResponse.json({ status: "error", message: "Forbidden: Admin access required" }, { status: 403 });
      }

      // 8. Request Logging
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

  return NextResponse.next();
}

// 9. Matcher must handle both endpoint families
export const config = { 
  matcher: ['/api/:path*', '/auth/:path*', '/api/auth/:path*'] 
};
