// seed.ts
import { PrismaPg } from "@prisma/adapter-pg";
import fs from 'fs';
import { v7 as uuidv7 } from 'uuid';
import { PrismaClient } from '../lib/generated/prisma/client';




const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL_UNPOOLED,
});
export const prisma = new PrismaClient({ adapter });

async function upsertWithRetry(p: any, retries = 3): Promise<void> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await prisma.profile.upsert({
        where: { name: p.name },
        update: {},
        create: {
          id: uuidv7(),
          ...p,
        },
      });
      return;
    } catch (err: any) {
      const isTimeout = err?.code === 'ETIMEDOUT' || err?.message?.includes('timeout');
      if (isTimeout && attempt < retries) {
        const delay = attempt * 1000;
        console.warn(`⚠️  Timeout on "${p.name}", retrying in ${delay}ms... (attempt ${attempt}/${retries})`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw err;
      }
    }
  }
}

export async function seed() {
  if (!fs.existsSync('./prisma/seed_profiles.json')) {
    console.error('seed_profiles.json file not found!');
    return;
  }

  const data = JSON.parse(fs.readFileSync('./prisma/seed_profiles.json', 'utf8'));
  const profiles: any[] = data['profiles'];

  console.log(`Seeding ${profiles.length} profiles...`);

  // Sequential processing — safest for Neon free tier
  for (let i = 0; i < profiles.length; i++) {
    await upsertWithRetry(profiles[i]);
    if ((i + 1) % 50 === 0) {
      console.log(`✅ Seeded ${i + 1} / ${profiles.length}`);
    }
  }

  console.log(`✅ Done: ${profiles.length} profiles seeded.`);
}

seed()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error during seeding:', error);
    prisma.$disconnect();
    process.exit(1);
  });