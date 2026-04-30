import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Parser } from 'json2csv';
import { logRequest } from '@/lib/logger'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');
  const startTime = Date.now();

  const corsHeaders = { 
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Version, Authorization'
  };

  if (format !== 'csv') {
    await logRequest('GET', '/api/profiles/export', 400, startTime);
    return NextResponse.json(
      { status: "error", message: "Invalid export format. Only 'csv' is supported." }, 
      { status: 400, headers: corsHeaders }
    );
  }

  try {
    // 1. Target Stage 2 Filter Constraints
    const where: any = {};
    if (searchParams.get('gender')) where.gender = searchParams.get('gender');
    if (searchParams.get('age_group')) where.age_group = searchParams.get('age_group');
    if (searchParams.get('country_id')) where.country_id = searchParams.get('country_id');

    // Min/Max Age
    const min_age = searchParams.get('min_age');
    const max_age = searchParams.get('max_age');
    if (min_age || max_age) {
      where.age = {};
      if (min_age) where.age.gte = parseInt(min_age);
      if (max_age) where.age.lte = parseInt(max_age);
    }

    // 2. Sorting Params
    const sort_by = searchParams.get('sort_by') || 'created_at';
    const order = (searchParams.get('order') || 'desc').toLowerCase() as 'asc' | 'desc';

    // Fetch matching profiles (No pagination limit for bulk file downloads)
    const profiles = await prisma.profile.findMany({ 
      where,
      orderBy: { [sort_by]: order }
    });

    if (profiles.length === 0) {
      await logRequest('GET', '/api/profiles/export', 404, startTime);
      return NextResponse.json({ status: "error", message: "No data found to export" }, { status: 404, headers: corsHeaders });
    }

    // 3. ENFORCE STRICT COLUMN SEQUENCE (No extra database strings!)
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
      'created_at'
    ];
    
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(profiles);

    await logRequest('GET', '/api/profiles/export', 200, startTime);

    // 4. Return formatted array as a downloaded string
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="profiles_${Date.now()}.csv"`,
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    await logRequest('GET', '/api/profiles/export', 500, startTime);
    return NextResponse.json({ status: "error", message: "Export failed" }, { status: 500, headers: corsHeaders });
  }
}
