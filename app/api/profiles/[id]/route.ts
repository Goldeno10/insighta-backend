import prisma from '@/lib/prisma';
import { NextResponse } from 'next/server';
// import { logRequest } from '@/lib/logger'

// const redis = Redis.fromEnv();
const corsHeaders = { 
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type , X-API-Version , Authorization'
  };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // const profile = await redis.get(`profile:data:${id}`);
  // const profiles = await prisma.profile.findMany({ where: { id } });
  const profile = await prisma.$queryRaw`SELECT * FROM "Profile" WHERE id = ${id}`;
  //  get the first profile from the array
  // const startTime = Date.now();


  if (!profile) {
    // await logRequest('GET', `/api/profiles/${id}`, 404, startTime);
    return NextResponse.json({ status: "error", message: "Profile not found" }, { status: 404, headers: corsHeaders });
  }
  // await logRequest('GET', `/api/profiles/${id}`, 200, startTime);
  return NextResponse.json({ status: "success", data: profile }, { headers: corsHeaders });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // SELECT * FROM "Profile" WHERE id = '019db916-a3aa-7324-8d42-2345a18864a3'
  // use raw SQL query to get the profile with the given id
  // const profile: any = await prisma.profile.findMany({ where: { id } });
    const profile = await prisma.$queryRaw`SELECT * FROM "Profile" WHERE id = ${id}`;
  //  get the first profile from the array
  // const startTime = Date.now();
  if (!profile) {
    // await logRequest('DELETE', `/api/profiles/${id}`, 404, startTime);
    return NextResponse.json({ status: "error", message: "Profile not found" }, { status: 404, headers: corsHeaders });
  }
  // await logRequest('DELETE', `/api/profiles/${id}`, 200, startTime);

  await prisma.profile.delete({ where: { id } });

  return new Response(null, { status: 204, headers: corsHeaders });
}
