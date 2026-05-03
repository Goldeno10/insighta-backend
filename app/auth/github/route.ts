import { NextResponse } from 'next/server';
import { logRequest } from '@/lib/logger';
import { Redis } from '@upstash/redis';
import crypto from 'crypto';

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
  const code_challenge = searchParams.get('code_challenge');
  const code_challenge_method = searchParams.get('code_challenge_method') ?? 'S256';
  const redirect = searchParams.get('redirect') ?? 'web'; // 'cli' or 'web'
  const code_verifier = searchParams.get('code_verifier'); // CLI sends this


  if (!code_challenge) {
    return NextResponse.json(
      { status: 'error', message: 'code_challenge is required' },
      { status: 400, headers: corsHeaders }
    );
  }

  const state = crypto.randomBytes(16).toString('hex');

  // Store state AND the redirect intent together
  await redis.set(
    `oauth_state:${state}`,
    JSON.stringify({ redirect, code_challenge, code_challenge_method, code_verifier }),
    { ex: 600 }
  );

  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!,
    scope: 'user:email',
    code_challenge,
    code_challenge_method,
    state,
    // Tell GitHub to always come back to YOUR backend
    // redirect_uri: `${process.env.NEXT_PUBLIC_API_URL}/auth/github/callback`,
  });

  const githubUrl = `https://github.com/login/oauth/authorize?${params}`;
  await logRequest('GET', '/auth/github', 302, startTime);
  return NextResponse.redirect(githubUrl, { headers: corsHeaders });
}