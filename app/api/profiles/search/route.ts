import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logRequest } from '@/lib/logger'

import { parseNaturalLanguage } from '@/lib/nlp-parser';
import { normalizeFilterFields, prismaWhereFromCanonical, searchQuerySubCacheKey } from '@/lib/query-normalize';
import { getCachedJson, searchProfilesCacheKey, setCachedJson, TTL_SEARCH_SEC } from '@/lib/profile-cache';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  if (!q) {
    logRequest('GET', request.url, 400, Date.now());
    return NextResponse.json({ status: "error", message: "Missing parameter" }, { status: 400, headers: corsHeaders });
  }

  const raw = parseNaturalLanguage(q);
  if (!raw) {
    logRequest('GET', request.url, 400, Date.now());
     return NextResponse.json({ status: "error", message: "Unable to interpret query" }, { status: 400, headers: corsHeaders });
  }

  const filters = normalizeFilterFields(raw);
  const where = prismaWhereFromCanonical(filters);
  const subKey = searchQuerySubCacheKey(filters);

  try {
    const cacheKey = await searchProfilesCacheKey(subKey);
    const cached = await getCachedJson<{ status: string; total: number; data: unknown }>(cacheKey);
    if (cached) {
      logRequest('GET', request.url, 200, Date.now());
      return NextResponse.json(cached, { headers: corsHeaders });
    }

    const data = await prisma.profile.findMany({
      where,
      take: 10,
      orderBy: { created_at: 'desc' },
    });

    const payload = {
      status: "success",
      total: data.length,
      data
    };

    await setCachedJson(cacheKey, payload, TTL_SEARCH_SEC);
    logRequest('GET', request.url, 200, Date.now());

    return NextResponse.json(payload, { headers: corsHeaders });

  } catch (error) {
    console.error("Search error:", error);
    logRequest('GET', request.url, 500, Date.now());
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500, headers: corsHeaders });
  }
}
