import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { logRequest } from '@/lib/logger'

const redis = Redis.fromEnv();
const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await redis.get(`profile:data:${id}`);
  const startTime = Date.now();

  if (!profile) {
    await logRequest('GET', `/api/profiles/${id}`, 404, startTime);
    return NextResponse.json({ status: "error", message: "Profile not found" }, { status: 404, headers: corsHeaders });
  }
  await logRequest('GET', `/api/profiles/${id}`, 200, startTime);
  return NextResponse.json({ status: "success", data: profile }, { headers: corsHeaders });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile: any = await redis.get(`profile:data:${id}`);
  const startTime = Date.now();
  if (!profile) {
    await logRequest('DELETE', `/api/profiles/${id}`, 404, startTime);
    return NextResponse.json({ status: "error", message: "Profile not found" }, { status: 404, headers: corsHeaders });
  }
  await logRequest('DELETE', `/api/profiles/${id}`, 200, startTime);

  await redis.del(`profile:data:${id}`);
  await redis.del(`profile:name:${profile.name}`);
  await redis.lrem('profiles:list', 0, id);

  return new Response(null, { status: 204, headers: corsHeaders });
}
