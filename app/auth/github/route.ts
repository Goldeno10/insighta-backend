import { NextResponse } from 'next/server';
import { logRequest } from '@/lib/logger'

export async function GET(request: Request) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const code_challenge = searchParams.get('code_challenge'); // Required for PKCE
  const state = searchParams.get('state'); // Optional, but recommended for security

  const githubUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email&code_challenge=${code_challenge}&code_challenge_method=S256&state=${state}`;

  await logRequest('GET', '/auth/github', 302, startTime);
  return NextResponse.redirect(githubUrl);
}
