import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

const redis = Redis.fromEnv();
const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await redis.get(`profile:data:${id}`);
  if (!profile) return NextResponse.json({ status: "error", message: "Profile not found" }, { status: 404, headers: corsHeaders });
  return NextResponse.json({ status: "success", data: profile }, { headers: corsHeaders });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile: any = await redis.get(`profile:data:${id}`);
  
  if (!profile) return NextResponse.json({ status: "error", message: "Profile not found" }, { status: 404, headers: corsHeaders });

  await redis.del(`profile:data:${id}`);
  await redis.del(`profile:name:${profile.name}`);
  await redis.lrem('profiles:list', 0, id);

  return new Response(null, { status: 204, headers: corsHeaders });
}
