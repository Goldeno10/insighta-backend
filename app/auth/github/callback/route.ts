import { NextResponse } from 'next/server';
import { logRequest } from '@/lib/logger'


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const startTime = Date.now();
  const state = searchParams.get('state'); // Catch the state here

  if (!code) {
    await logRequest('GET', '/auth/github/callback', 400, startTime);
    return NextResponse.json({ status: "error", message: "Code parameter missing" }, { status: 400 });
  }

  // 1. If it originated from Web, send it back to your Web Portal callback
  if (state === 'web') {
    // Port 3001 is standard for the local Web Portal
    await logRequest('GET', '/auth/github/callback', 302, startTime);
    return NextResponse.redirect(`https://insighta-web-swart.vercel.app/callback?code=${code}`);
  }

  // 2. Otherwise, fall back to the CLI flow on port 4800
  await logRequest('GET', '/auth/github/callback', 302, startTime);
  return NextResponse.redirect(`https://insighta-web-swart.vercel.app/callback?code=${code}&state=cli`);
}