import { logRequest } from '@/lib/logger';
import prisma from '@/lib/prisma';
import { Redis } from '@upstash/redis';
import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';


const redis = Redis.fromEnv();

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  if (!state) {
    return NextResponse.json({ status: 'error', message: 'Missing state' }, { status: 400, headers: corsHeaders });
  }

  const stored = await redis.get<string>(`oauth_state:${state}`);
  if (!stored) {
    return NextResponse.json({ status: 'error', message: 'Invalid or expired state' }, { status: 400, headers: corsHeaders });
  }

  await redis.del(`oauth_state:${state}`);

  // ignore this error: Property 'redirect' does not exist on type 'String' 
  // ++ because we know it's already parsed by upstach redis so ano parsing not needed.
  // @ts-ignore // @ts-expect-error
  const { redirect, code_verifier } = stored;

  if (!code) {
    return NextResponse.json({ status: 'error', message: 'Missing code' }, { status: 400, headers: corsHeaders });
  }

  // Exchange code with GitHub
  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID!,
      client_secret: process.env.GITHUB_CLIENT_SECRET!,
      code,
      code_verifier,
    }),
  });

  const tokenData = await tokenRes.json();

  if (tokenData.error || !tokenData.access_token) {
    return NextResponse.json(
      { status: 'error', message: tokenData.error_description ?? 'Token exchange failed' },
      { status: 400, headers: corsHeaders }
    );
  }

  await logRequest('GET', '/auth/github/callback', 200, startTime);

  // Fetch User Info from GitHub
  const userRes = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const ghUser = await userRes.json();

  // Upsert User in Database
  const user = await prisma.user.upsert({
    where: { github_id: ghUser.id.toString() },
    update: { last_login_at: new Date() },
    create: {
      github_id: ghUser.id.toString(),
      username: ghUser.login,
      email: ghUser.email,
      avatar_url: ghUser.avatar_url,
      role: 'analyst', // Default role for HNG
    },
  });

  // Issue Access & Refresh Tokens
  const accessToken = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: '2h' } // 2 hours
  );

  const refreshToken = jwt.sign(
    { userId: user.id },
    process.env.REFRESH_SECRET!,
    { expiresIn: '5h' } // 5 hours as requested
  );

  // ── Branch: web gets a redirect, CLI gets a custom scheme redirect ────────
  if (redirect === 'cli') {
    const params = new URLSearchParams({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: '18000', // 5 hours in seconds
    }).toString();

    // Browser opens this URI → OS hands it to your CLI process
    // return NextResponse.redirect(`insighta://callback?${params}`);
    return NextResponse.redirect(`http://localhost:${process.env.CLI_CALLBACK_PORT ?? 4800}/callback?${params}`);

  }

  // Web flow → redirect to frontend with token in query or cookie
  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_WEB_URL}/callback?access_token=${accessToken}&refresh_token=${refreshToken}&expires_in=18000`
  );
}
