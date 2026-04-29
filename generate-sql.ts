// generate-sql.ts
import fs from 'fs';
import { v7 as uuidv7 } from 'uuid';

const data = JSON.parse(fs.readFileSync('./prisma/seed_profiles.json', 'utf8'));
const profiles: any[] = data['profiles'];

const lines = profiles.map(p => {
  const id = uuidv7();
  const escape = (s: string) => String(s).replace(/'/g, "''");

  return `INSERT INTO "Profile" (id, name, gender, gender_probability, age, age_group, country_id, country_name, country_probability) VALUES ('${id}', '${escape(p.name)}', '${escape(p.gender)}', ${p.gender_probability}, ${p.age}, '${escape(p.age_group)}', '${escape(p.country_id)}', '${escape(p.country_name)}', ${p.country_probability}) ON CONFLICT (name) DO NOTHING;`;
}).join('\n');

fs.writeFileSync('./prisma/seed.sql', lines);
console.log(`✅ Generated seed.sql with ${profiles.length} inserts`);