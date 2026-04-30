import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Parser } from 'json2csv';
import { logRequest } from '@/lib/logger';
import { cookies } from 'next/headers';
import jwt from 'jsonwebtoken';

const allowedSortFields = ['created_at', 'name', 'age', 'country_id', 'gender'];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');
  const startTime = Date.now();

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Version, Authorization',
  };

  // 1. Auth check
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value
      ?? request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      logRequest('GET', '/api/profiles/export', 401, startTime).catch(console.error);
      return NextResponse.json(
        { status: 'error', message: 'Unauthorized' },
        { status: 401, headers: corsHeaders }
      );
    }

    jwt.verify(token, process.env.JWT_SECRET!);
  } catch {
    logRequest('GET', '/api/profiles/export', 401, startTime).catch(console.error);
    return NextResponse.json(
      { status: 'error', message: 'Invalid or expired token' },
      { status: 401, headers: corsHeaders }
    );
  }

  // 2. Validate format
  if (format !== 'csv') {
    logRequest('GET', '/api/profiles/export', 400, startTime).catch(console.error);
    return NextResponse.json(
      { status: 'error', message: "Invalid export format. Only 'csv' is supported." },
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // 3. Build filters
    const where: any = {};
    if (searchParams.get('gender')) where.gender = searchParams.get('gender');
    if (searchParams.get('age_group')) where.age_group = searchParams.get('age_group');
    if (searchParams.get('country_id')) where.country_id = searchParams.get('country_id');

    const min_age = searchParams.get('min_age');
    const max_age = searchParams.get('max_age');
    if (min_age || max_age) {
      where.age = {};
      if (min_age) where.age.gte = parseInt(min_age);
      if (max_age) where.age.lte = parseInt(max_age);
    }

    // 4. Sanitized sort
    const rawSortBy = searchParams.get('sort_by') ?? 'created_at';
    const sort_by = allowedSortFields.includes(rawSortBy) ? rawSortBy : 'created_at';
    const order = (searchParams.get('order') ?? 'desc').toLowerCase() as 'asc' | 'desc';

    // 5. Fetch profiles
    const profiles = await prisma.profile.findMany({
      where,
      orderBy: { [sort_by]: order },
    });

    if (profiles.length === 0) {
      logRequest('GET', '/api/profiles/export', 404, startTime).catch(console.error);
      return NextResponse.json(
        { status: 'error', message: 'No data found to export' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 6. Convert to CSV
    const fields = [
      'id',
      'name',
      'gender',
      'gender_probability',
      'age',
      'age_group',
      'country_id',
      'country_name',
      'country_probability',
      'created_at',
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(profiles);

    logRequest('GET', '/api/profiles/export', 200, startTime).catch(console.error);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="profiles_${Date.now()}.csv"`,
      },
    });

  } catch (error) {
    console.error('[Export Error]', error);
    logRequest('GET', '/api/profiles/export', 500, startTime).catch(console.error);
    return NextResponse.json(
      { status: 'error', message: 'Export failed' },
      { status: 500, headers: corsHeaders }
    );
  }
}