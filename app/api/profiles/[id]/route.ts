import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { logRequest } from '@/lib/logger'
import { getCachedJson, profileByIdCacheKey, setCachedJson, TTL_BY_ID_SEC } from '@/lib/profile-cache';
import { bumpProfileDataVersion } from '@/lib/profile-data-version';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type , X-API-Version , Authorization'
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const startTime = Date.now();

  try {
    const cacheKey = await profileByIdCacheKey(id);
    const cached = await getCachedJson<{ status: string; data: unknown }>(cacheKey);
    if (cached) {
      logRequest('GET', `/api/profiles/${id}`, 200, startTime);
      return NextResponse.json(cached, { headers: corsHeaders });
    }


    const profile = await prisma.$queryRaw`SELECT * FROM "Profile" WHERE id = ${id}`;

    if (!profile) {
      logRequest('GET', `/api/profiles/${id}`, 404, startTime);
      return NextResponse.json({ status: "error", message: "Profile not found" }, { status: 404, headers: corsHeaders });
    }

    const payload = { status: "success", data: profile };
    await setCachedJson(cacheKey, payload, TTL_BY_ID_SEC);
    logRequest('GET', `/api/profiles/${id}`, 200, startTime);
    return NextResponse.json(payload, { headers: corsHeaders });
  } catch (e) {
    console.error(e);
    logRequest('GET', `/api/profiles/${id}`, 500, startTime);
    return NextResponse.json({ status: "error", message: "Server failure" }, { status: 500, headers: corsHeaders });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const startTime = Date.now();

  const rows = await prisma.profile.findMany({
    where: { id },
    take: 1,
  });

  if (rows.length === 0) {
    logRequest('DELETE', `/api/profiles/${id}`, 404, startTime);
    return NextResponse.json({ status: "error", message: "Profile not found" }, { status: 404, headers: corsHeaders });
  }

  await prisma.profile.delete({ where: { id } });
  await bumpProfileDataVersion();

  logRequest('DELETE', `/api/profiles/${id}`, 204, startTime);

  return new Response(null, { status: 204, headers: corsHeaders });
}
