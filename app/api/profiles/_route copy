import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';
import { v7 as uuidv7 } from 'uuid';

const redis = Redis.fromEnv();
const corsHeaders = { 'Access-Control-Allow-Origin': '*' };

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { name } = body;

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ status: "error", message: "Missing or invalid name" }, { status: 400, headers: corsHeaders });
    }

    const nameKey = `profile:name:${name.toLowerCase()}`;

    // 1. Check if profile exists (Duplicate Check)
    const existingId = await redis.get<string>(nameKey);
    if (existingId) {
      const existingProfile = await redis.get(`profile:data:${existingId}`);
      return NextResponse.json({
        status: "success",
        message: "Profile already exists",
        data: existingProfile
      }, { status: 201, headers: corsHeaders });
    }

    // 2. Fetch from APIs
    const [genRes, agiRes, natRes] = await Promise.all([
      fetch(`https://api.genderize.io/?name=${name}`),
      fetch(`https://api.agify.io/?name=${name}`),
      fetch(`https://api.nationalize.io/?name=${name}`)
    ]);

    const gen = await genRes.json();
    const agi = await agiRes.json();
    const nat = await natRes.json();

    if (!gen.gender || gen.count === 0) return error502("Genderize");
    if (agi.age === null) return error502("Agify");
    if (!nat.country || nat.country.length === 0) return error502("Nationalize");

    // 3. Logic
    const age = agi.age;
    let age_group = "senior";
    if (age <= 12) age_group = "child";
    else if (age <= 19) age_group = "teenager";
    else if (age <= 59) age_group = "adult";

    const topCountry = nat.country.reduce((prev: any, curr: any) => prev.probability > curr.probability ? prev : curr);

    const id = uuidv7();
    const newProfile = {
      id,
      name: name.toLowerCase(),
      gender: gen.gender,
      gender_probability: gen.probability,
      sample_size: gen.count,
      age,
      age_group,
      country_id: topCountry.country_id,
      country_probability: topCountry.probability,
      created_at: new Date().toISOString()
    };

    // 4. Save to Redis (Store index by name and store data by ID)
    await redis.set(nameKey, id);
    await redis.set(`profile:data:${id}`, newProfile);
    await redis.lpush('profiles:list', id); // For "Get All"

    return NextResponse.json({ status: "success", data: newProfile }, { status: 201, headers: corsHeaders });

  // } catch (e: any) {
  //   console.error("REDIS ERROR:", e); // This prints the real error to your terminal
  //   return NextResponse.json({
  //     status: "error",
  //     message: e.message || "Server failure"
  //   }, { status: 500, headers: corsHeaders });
  // }
  } catch (e) {
    return NextResponse.json({ status: "error", message: "Server failure" }, { status: 500, headers: corsHeaders });
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const f_gender = searchParams.get('gender')?.toLowerCase();
  const f_country = searchParams.get('country_id')?.toUpperCase();
  const f_age_group = searchParams.get('age_group')?.toLowerCase();

  const allIds = await redis.lrange('profiles:list', 0, -1);
  const allData: any[] = await Promise.all(allIds.map(id => redis.get(`profile:data:${id}`)));

  const filtered = allData.filter(p => {
    if (f_gender && p.gender !== f_gender) return false;
    if (f_country && p.country_id !== f_country) return false;
    if (f_age_group && p.age_group !== f_age_group) return false;
    return true;
  });

  return NextResponse.json({ status: "success", count: filtered.length, data: filtered }, { headers: corsHeaders });
}

function error502(api: string) {
  return NextResponse.json({ status: "error", message: `${api} returned an invalid response` }, { status: 502, headers: corsHeaders });
}
