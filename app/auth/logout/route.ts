import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { serialize } from 'cookie';

const redis = Redis.fromEnv();
const corsHeaders = { 
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('Authorization');
    const { refresh_token } = await request.json().catch(() => ({}));

    const response = NextResponse.json({ 
      status: "success", 
      message: "Logged out successfully" 
    }, { headers: corsHeaders });

    // 1. Invalidate Refresh Token in Redis (for both CLI and Web)
    if (refresh_token) {
      // Blacklist the token for 5 minutes (its max lifespan)
      await redis.set(`invalid_token:${refresh_token}`, "true", { ex: 300 });
    }

    // 2. Clear HTTP-Only Cookies (Specifically for the Web Portal)
    response.headers.append(
      'Set-Cookie',
      serialize('access_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0, // Immediately expires the cookie
        path: '/',
      })
    );

    response.headers.append(
      'Set-Cookie',
      serialize('refresh_token', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 0, // Immediately expires the cookie
        path: '/',
      })
    );

    return response;
  } catch (error) {
    return NextResponse.json({ status: "error", message: "Logout failed" }, { status: 500, headers: corsHeaders });
  }
}


export async function GET() {
  return NextResponse.json(
    { status: 'error', message: 'Method not allowed. Use POST.' },
    { status: 405, headers: { ...corsHeaders, Allow: 'POST, OPTIONS' } }
  );
}