import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { logRequest } from '@/lib/logger'
import { v7 as uuidv7 } from 'uuid'; // Enforce UUID v7 standard
import {
  listQuerySubCacheKey,
  normalizeListQueryFromSearchParams,
  prismaWhereFromCanonical,
} from '@/lib/query-normalize';
import { getCachedJson, listProfilesCacheKey, setCachedJson, TTL_LIST_SEC } from '@/lib/profile-cache';
import { bumpProfileDataVersion } from '@/lib/profile-data-version';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startTime = Date.now();

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Version, Authorization',
  };

  try {
    const nq = normalizeListQueryFromSearchParams(searchParams);
    const where = prismaWhereFromCanonical(nq.filters);
    const subKey = listQuerySubCacheKey(nq);
    const cacheKey = await listProfilesCacheKey(subKey);
    const cached = await getCachedJson<{
      status: string;
      data: unknown;
      pagination: unknown;
    }>(cacheKey);
    if (cached) {
      await logRequest('GET', '/api/profiles', 200, startTime);
      return NextResponse.json(cached, { status: 200, headers: corsHeaders });
    }

    const skip = (nq.page - 1) * nq.limit;

    const [total, data] = await Promise.all([
      prisma.profile.count({ where }),
      prisma.profile.findMany({
        where,
        take: nq.limit,
        skip,
        orderBy: { [nq.sort_by]: nq.order },
      }),
    ]);

    const total_pages = Math.ceil(total / nq.limit);
    const has_next = nq.page < total_pages;

    const payload = {
      status: "success",
      data,
      pagination: {
        total,
        total_pages,
        current_page: nq.page,
        limit: nq.limit,
        has_next,
        page: nq.page,
        links: {
          self: `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profiles?page=${nq.page}`,
          next: has_next ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profiles?page=${nq.page + 1}` : null,
          prev: nq.page > 1 ? `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/profiles?page=${nq.page - 1}` : null,
        },
      },
    };

    await setCachedJson(cacheKey, payload, TTL_LIST_SEC);
    await logRequest('GET', '/api/profiles', 200, startTime);

    return NextResponse.json(payload, {
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
    type NatCountry = { country_id: string; probability: number | string };
    const countries = nat.country as NatCountry[];
    const topCountry = countries.reduce((prev, curr) =>
      Number(prev.probability) > Number(curr.probability) ? prev : curr
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
        country_probability: parseFloat(String(topCountry.probability)),
      }
    });

    await bumpProfileDataVersion();

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
