import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import jwt from 'jsonwebtoken';

const corsHeaders = {
  // 1. You MUST use '*' or your exact web portal URL (e.g. http://localhost:3001)
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version',
  'Access-Control-Max-Age': '86400', // Caches the preflight for 24 hours
};

// 2. THIS IS THE PREFLIGHT HANDLER the browser is failing on!
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204, // 204 No Content is the standard for preflight
    headers: corsHeaders,
  });
}

export async function POST(request: Request) {
  try {
    const { code, code_verifier } = await request.json();

    if (!code) {
      return NextResponse.json({ status: "error", message: "Code required" }, { status: 400, headers: corsHeaders });
    }

    // const { code } = await request.json().catch(() => ({})); // or searchParams.get('code')

    // 💡 MENTOR DIRECTIVE: Handle "test_code" for automated Admin token extraction
    if (code === 'test_code') {
      const adminToken = jwt.sign(
        { userId: "mock-admin-uuid-01", role: "admin" },
        process.env.JWT_SECRET!,
        { expiresIn: '3m' }
      );

      const refreshToken = jwt.sign(
        { userId: "mock-admin-uuid-01" },
        process.env.REFRESH_SECRET!,
        { expiresIn: '5m' }
      );

      return NextResponse.json({
        status: "success",
        access_token: adminToken,
        refresh_token: refreshToken,
        expires_in: 180
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }


    // 1. Exchange code for GitHub Access Token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        code_verifier, // Include PKCE code verifier
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return NextResponse.json({ status: "error", message: tokenData.error_description || "GitHub exchange failed" }, { status: 400, headers: corsHeaders });
    }

    // 2. Fetch User Info from GitHub
    const userRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const ghUser = await userRes.json();

    // 3. Upsert User in Database
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

    // 4. Issue Access & Refresh Tokens
    const accessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '2h' } // 2 hours as requested
    );

    const refreshToken = jwt.sign(
      { userId: user.id },
      process.env.REFRESH_SECRET!,
      { expiresIn: '5h' } // 5 hours as requested
    );

    return NextResponse.json({
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 18000 // 5 hours
    }, {
      status: 200,
      headers: corsHeaders
    });

  } catch (error) {
    return NextResponse.json({ status: "error", message: "Server failure" }, { status: 500, headers: corsHeaders });
  }
}
