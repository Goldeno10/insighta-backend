import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const corsHeaders = { 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Version, Authorization',
  };

  try {
    // 1. Pagination (Numbers)
    const page = Math.max(1, parseInt(searchParams.get('page') || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10')));
    const skip = (page - 1) * limit;

    // 2. Sorting
    const allowedSort = ['age', 'created_at', 'gender_probability'];
    const sort_by = searchParams.get('sort_by') || 'created_at';
    const validatedSort = allowedSort.includes(sort_by) ? sort_by : 'created_at';
    const order = (searchParams.get('order') || 'desc').toLowerCase() as 'asc' | 'desc';

    // 3. Filtering
    const where: any = {};
    if (searchParams.get('gender')) where.gender = searchParams.get('gender')?.toLowerCase();
    if (searchParams.get('age_group')) where.age_group = searchParams.get('age_group')?.toLowerCase();
    if (searchParams.get('country_id')) where.country_id = searchParams.get('country_id')?.toUpperCase();

    // Age Range (Crucial: Must be Integers)
    const min_age = searchParams.get('min_age');
    const max_age = searchParams.get('max_age');
    if (min_age || max_age) {
      where.age = {};
      if (min_age) where.age.gte = parseInt(min_age);
      if (max_age) where.age.lte = parseInt(max_age);
    }

    // Probabilities (Crucial: Must be Floats)
    const min_g_prob = searchParams.get('min_gender_probability');
    if (min_g_prob) where.gender_probability = { gte: parseFloat(min_g_prob) };

    const min_c_prob = searchParams.get('min_country_probability');
    if (min_c_prob) where.country_probability = { gte: parseFloat(min_c_prob) };

    // 4. Execution
    const [total, data] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        take: limit,
        skip: skip,
        orderBy: { [validatedSort]: order }
      })
    ]);

    // 5. Calculate Pagination Metadata
    const total_pages = Math.ceil(total / limit);
    const has_next = page < total_pages;

    return NextResponse.json({
      status: "success",
      data,
      pagination: {
        total,
        total_pages,
        current_page: page,
        limit,
        has_next
      }
    }, { 
      status: 200,
      headers: corsHeaders 
    });

    // // 4. Execution
    // const [total, data] = await Promise.all([
    //   prisma.profile.count({ where }),
    //   prisma.profile.findMany({
    //     where,
    //     take: limit,
    //     skip: skip,
    //     orderBy: { [validatedSort]: order }
    //   })
    // ]);

    // return NextResponse.json({
    //   status: "success",
    //   page, limit, total, data
    // }, { headers: corsHeaders });

  } catch (error) {
    console.error("Query Error:", error);
    return NextResponse.json({ 
      status: "error", 
      message: error instanceof Error ? error.message : "Server failure" 
  }, { status: 500, headers: corsHeaders });
}
}
