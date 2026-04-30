import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { redis } from '@/lib/redis';
import { prisma } from '@/lib/prisma';


export async function POST(request: Request) {
  try {
    const { refresh_token } = await request.json();

    if (!refresh_token) {
      return NextResponse.json({ status: "error", message: "Refresh token required" }, { status: 400 });
    }

    const decoded = jwt.verify(refresh_token, process.env.REFRESH_SECRET!) as jwt.JwtPayload & { userId: string };

    const isInvalid = await redis.get(`invalid_token:${refresh_token}`);
    if (isInvalid) {
      return NextResponse.json({ status: "error", message: "Token has been invalidated" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || !user.is_active) {
      return NextResponse.json({ status: "error", message: "User access revoked" }, { status: 403 });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = typeof decoded.exp === 'number' ? decoded.exp : nowSec + 60;
    const remainingSec = Math.max(expSec - nowSec, 1);
    await redis.set(`invalid_token:${refresh_token}`, "true", { ex: remainingSec });

    const newAccessToken = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: 3600 } // 1 hour in seconds
    );

    const newRefreshToken = jwt.sign(
      { userId: user.id },
      process.env.REFRESH_SECRET!,
      { expiresIn: 18000 } // 5 hours in seconds
    );

    return NextResponse.json({
      status: "success",
      access_token: newAccessToken,
      refresh_token: newRefreshToken
    });
  } catch {
    return NextResponse.json({ status: "error", message: "Invalid or expired refresh token" }, { status: 401 });
  }
}

