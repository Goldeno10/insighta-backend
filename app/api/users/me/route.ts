import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jwtVerify } from 'jose';
import { logRequest } from '@/lib/logger'

export async function GET(request: Request) {
    const startTime = Date.now();
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version'
    };

    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
        await logRequest('GET', '/api/users/me', 401, startTime);
        return NextResponse.json({ status: "error", message: "Token required" }, { status: 401, headers: corsHeaders });
    }

    try {
        const secret = new TextEncoder().encode(process.env.JWT_SECRET);
        const { payload } = await jwtVerify(token, secret);
        const userId = payload.userId as string;

        // Fetch user from Postgres
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                github_id: true,
                username: true,
                email: true,
                role: true,
                avatar_url: true,
                created_at: true
            }
        });

        if (!user) {
            await logRequest('GET', '/api/users/me', 404, startTime);
            return NextResponse.json({ status: "error", message: "User not found" }, { status: 404, headers: corsHeaders });
        }

        await logRequest('GET', '/api/users/me', 200, startTime);
        return NextResponse.json({
            status: "success",
            data: user
        }, { status: 200, headers: corsHeaders });

    } catch (error) {
        await logRequest('GET', '/api/users/me', 401, startTime);
        return NextResponse.json({ status: "error", message: "Invalid or expired token" }, { status: 401, headers: corsHeaders });
    }
}

// Support preflight requests
export async function OPTIONS() {
    return NextResponse.json({}, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version' } });
}
