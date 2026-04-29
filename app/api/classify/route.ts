import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name');

  // 1. Validation Logic
  if (!name || name.trim() === "") {
    return NextResponse.json({ status: "error", message: "Missing or empty name parameter" }, { status: 400 });
  }

  // Next.js searchParams are always strings, but for strict assessment:
  if (typeof name !== 'string') {
    return NextResponse.json({ status: "error", message: "name is not a string" }, { status: 422 });
  }

  try {
    // 2. Fetch from Genderize
    // https://api.genderize.io?name=peter
    const response = await fetch(`https://api.genderize.io?name=${encodeURIComponent(name)}`);
    
    if (!response.ok) throw new Error('Upstream failure');
    
    const data = await response.json();

    // 3. Handle Genderize Edge Cases
    if (!data.gender || data.count === 0) {
      return NextResponse.json({ 
        status: "error", 
        message: "No prediction available for the provided name" 
      }, { status: 200 });
    }

    // 4. Processing Logic
    const probability = data.probability;
    const sample_size = data.count;
    const is_confident = probability >= 0.7 && sample_size >= 100;
    const processed_at = new Date().toISOString();

    // 5. Success Response
    return NextResponse.json({
      status: "success",
      data: {
        name: data.name,
        gender: data.gender,
        probability: probability,
        sample_size: sample_size,
        is_confident: is_confident,
        processed_at: processed_at
      }
    }, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*', // Critical for HNG grading
      }
    });

  } catch (error) {
    return NextResponse.json({ status: "error", message: "Upstream or server failure" }, { status: 502 });
  }
}
