import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logRequest } from '@/lib/logger'
import { v7 as uuidv7 } from 'uuid'; // Enforce UUID v7 standard


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startTime = Date.now();

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
    
    await logRequest('GET', '/api/profiles', 200, startTime);
    
    return NextResponse.json({
      status: "success",
      data,
      pagination: {
        total, //status, page, limit, total, total_pages, links, data)
        total_pages,
        current_page: page,
        limit,
        has_next,
        page: page,
        links: {
          self: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profiles?page=${page}`,
          next: has_next ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profiles?page=${page + 1}` : null,
          prev: page > 1 ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profiles?page=${page - 1}` : null
        },
      }
    }, {
      status: 200,
      headers: corsHeaders
    });
  } catch (error) {
    console.error("Query Error:", error);
    await logRequest('GET', '/api/profiles', 500, startTime);
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Server failure"
    }, { status: 500, headers: corsHeaders });
  }
}



const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Version',
};

// Map of common ISO codes to full names (Keep this localized to avoid slow fetches)
const countryNames: Record<string, string> = {
  US: "United States", NG: "Nigeria", KE: "Kenya", GH: "Ghana",
  GB: "United Kingdom", CA: "Canada", TZ: "Tanzania", AO: "Angola"
};

export async function POST(request: Request) {
  try {
    // 1. Role-Based Access Control (Admin Only)
    const userRole = request.headers.get('x-user-role');
    
    if (userRole !== 'admin') {
      return NextResponse.json(
        { status: "error", message: "Forbidden: Admin access required" }, 
        { status: 403, headers: corsHeaders }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { name } = body;

    // 2. Validation
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json(
        { status: "error", message: "Missing or invalid profile name" }, 
        { status: 400, headers: corsHeaders }
      );
    }

    const trimmedName = name.trim();

    // 3. Duplicate Check
    const existing = await prisma.profile.findUnique({ where: { name: trimmedName } });
    if (existing) {
      return NextResponse.json(
        { status: "error", message: "A profile with this name already exists" }, 
        { status: 422, headers: corsHeaders }
      );
    }

    // 4. Calls external APIs (Stage 1 logic)
    const encodedName = encodeURIComponent(trimmedName);
    const [genRes, agiRes, natRes] = await Promise.all([
      fetch(`https://api.genderize.io?name=${encodedName}`),
      fetch(`https://api.agify.io?name=${encodedName}`),
      fetch(`https://api.nationalize.io?name=${encodedName}`)
    ]);

    const gen = await genRes.json();
    const agi = await agiRes.json();
    const nat = await natRes.json();

    // Validation for upstream API failures (Stage 1 rule)
    if (!gen.gender || gen.count === 0) return error502("Genderize");
    if (agi.age === null) return error502("Agify");
    if (!nat.country || nat.country.length === 0) return error502("Nationalize");

    // 5. Transforms data
    const age = agi.age;
    let age_group = "senior";
    if (age <= 12) age_group = "child";
    else if (age <= 19) age_group = "teenager";
    else if (age <= 59) age_group = "adult";

    // Extract country with highest probability
    const topCountry = nat.country.reduce((prev: any, curr: any) => 
      prev.probability > curr.probability ? prev : curr
    );

    // 6. Stores in database
    const newProfile = await prisma.profile.create({
      data: {
        id: uuidv7(), // TIME-SORTABLE UUID v7
        name: trimmedName,
        gender: gen.gender,
        gender_probability: parseFloat(gen.probability),
        age: age,
        age_group: age_group,
        country_id: topCountry.country_id,
        country_name: countryNames[topCountry.country_id] || topCountry.country_id,
        country_probability: parseFloat(topCountry.probability),
      }
    });

    // 7. Returns saved profile
    return NextResponse.json({
      status: "success",
      data: newProfile
    }, { status: 201, headers: corsHeaders });

  } catch (error) {
    console.error("Create Profile Error:", error);
    return NextResponse.json(
      { status: "error", message: "Server failure" }, 
      { status: 500, headers: corsHeaders }
    );
  }
}

function error502(api: string) {
  return NextResponse.json(
    { status: "error", message: `${api} returned an invalid response` }, 
    { status: 502, headers: corsHeaders }
  );
}

// Handle preflight checks
export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

