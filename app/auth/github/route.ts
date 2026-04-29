import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code_challenge = searchParams.get('code_challenge'); // Required for PKCE
  const state = searchParams.get('state'); // Optional, but recommended for security

  const githubUrl = `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=user:email&code_challenge=${code_challenge}&code_challenge_method=S256&state=${state}`;

  return NextResponse.redirect(githubUrl);
}
