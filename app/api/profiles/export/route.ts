import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { Parser } from 'json2csv';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format');

  if (format !== 'csv') {
    return NextResponse.json({ status: "error", message: "Invalid export format. Only 'csv' is supported." }, { status: 400 });
  }

  try {
    // 1. Reuse Stage 2 Filtering Logic
    const where: any = {};
    if (searchParams.get('gender')) where.gender = searchParams.get('gender');
    if (searchParams.get('age_group')) where.age_group = searchParams.get('age_group');
    if (searchParams.get('country_id')) where.country_id = searchParams.get('country_id');

    // 2. Fetch all matching profiles (no pagination for exports)
    const profiles = await prisma.profile.findMany({ 
      where,
      orderBy: { created_at: 'desc' }
    });

    if (profiles.length === 0) {
      return NextResponse.json({ status: "error", message: "No data found to export" }, { status: 404 });
    }

    // 3. Convert JSON to CSV
    const fields = [
      'id', 'name', 'gender', 'gender_probability', 
      'age', 'age_group', 'country_id', 'country_name', 
      'country_probability', 'created_at'
    ];
    const json2csvParser = new Parser({ fields });
    const csv = json2csvParser.parse(profiles);

    // 4. Return as a downloadable file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename=profiles_export_${Date.now()}.csv`,
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (error) {
    return NextResponse.json({ status: "error", message: "Export failed" }, { status: 500 });
  }
}
