import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { parseNaturalLanguage } from '@/lib/nlp-parser';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q');
  const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

  if (!q) return NextResponse.json({ status: "error", message: "Missing parameter" }, { status: 400, headers: corsHeaders });

  const filters = parseNaturalLanguage(q);
  if (!filters) return NextResponse.json({ status: "error", message: "Unable to interpret query" }, { status: 400, headers: corsHeaders });

  try {
    // Build 'where' object directly from NLP filters
    const where: any = {};
    if (filters.gender) where.gender = filters.gender;
    if (filters.age_group) where.age_group = filters.age_group;
    if (filters.country_id) where.country_id = filters.country_id;

    if (filters.min_age || filters.max_age) {
      where.age = {};
      if (filters.min_age) where.age.gte = parseInt(filters.min_age);
      if (filters.max_age) where.age.lte = parseInt(filters.max_age);
    }

    // Execute query directly without calling fetch()
    const data = await prisma.profile.findMany({
      where,
      take: 10 // Default limit for search
    });

    return NextResponse.json({
      status: "success",
      total: data.length,
      data
    }, { headers: corsHeaders });

  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    }, { status: 500, headers: corsHeaders });
  }
}
