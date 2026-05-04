import prisma from '@/lib/prisma';
import { v7 as uuidv7 } from 'uuid';

export type IngestReasonKey =
  | 'duplicate_name'
  | 'invalid_age'
  | 'missing_fields'
  | 'invalid_gender'
  | 'invalid_country'
  | 'invalid_probability'
  | 'invalid_age_group'
  | 'malformed_row';

export type IngestReasons = Partial<Record<IngestReasonKey, number>>;

const AGE_GROUPS = new Set(['child', 'teenager', 'adult', 'senior']);
const GENDERS = new Set(['male', 'female']);

export type ValidatedProfileInsert = {
  id: string;
  name: string;
  gender: string;
  gender_probability: number;
  age: number;
  age_group: string;
  country_id: string;
  country_name: string;
  country_probability: number;
  created_at?: Date;
};

function bump(r: IngestReasons, key: IngestReasonKey) {
  r[key] = (r[key] ?? 0) + 1;
}

function lowerKeys(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    out[String(k).trim().toLowerCase()] = v == null ? '' : String(v).trim();
  }
  return out;
}

/**
 * Validate one CSV record (after csv-parse column mapping). Returns a row ready for createMany or a skip reason.
 */
export function validateProfileCsvRow(raw: Record<string, unknown>): { ok: true; row: ValidatedProfileInsert } | { ok: false; reason: IngestReasonKey } {
  const rec = lowerKeys(raw);

  const required = [
    'name',
    'gender',
    'gender_probability',
    'age',
    'age_group',
    'country_id',
    'country_name',
    'country_probability',
  ] as const;

  for (const k of required) {
    if (!rec[k] || rec[k].length === 0) {
      return { ok: false, reason: 'missing_fields' };
    }
  }

  const gender = rec.gender.toLowerCase();
  if (!GENDERS.has(gender)) return { ok: false, reason: 'invalid_gender' };

  const age = Number.parseInt(rec.age, 10);
  if (!Number.isFinite(age) || age < 0 || age > 130) return { ok: false, reason: 'invalid_age' };

  const age_group = rec.age_group.toLowerCase();
  if (!AGE_GROUPS.has(age_group)) return { ok: false, reason: 'invalid_age_group' };

  const country_id = rec.country_id.toUpperCase();
  if (!/^[A-Z]{2}$/.test(country_id)) return { ok: false, reason: 'invalid_country' };

  const gProb = Number.parseFloat(rec.gender_probability);
  const cProb = Number.parseFloat(rec.country_probability);
  if (!Number.isFinite(gProb) || gProb < 0 || gProb > 1) return { ok: false, reason: 'invalid_probability' };
  if (!Number.isFinite(cProb) || cProb < 0 || cProb > 1) return { ok: false, reason: 'invalid_probability' };

  let id = rec.id?.trim() || '';
  const uuidV4Or7 =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!id || !uuidV4Or7.test(id)) id = uuidv7();

  let created_at: Date | undefined;
  if (rec.created_at && rec.created_at.length > 0) {
    const d = new Date(rec.created_at);
    if (!Number.isNaN(d.getTime())) created_at = d;
  }

  return {
    ok: true,
    row: {
      id,
      name: rec.name,
      gender,
      gender_probability: gProb,
      age,
      age_group,
      country_id,
      country_name: rec.country_name,
      country_probability: cProb,
      created_at,
    },
  };
}

/**
 * Chunked bulk insert: not one-by-one; skips duplicates by name (DB + in-chunk dedupe handled by caller).
 */
export async function insertProfileBatch(
  rows: ValidatedProfileInsert[],
  reasons: IngestReasons
): Promise<number> {
  if (rows.length === 0) return 0;

  const names = rows.map((r) => r.name);
  const existing = await prisma.profile.findMany({
    where: { name: { in: names } },
    select: { name: true },
  });
  const existingSet = new Set(existing.map((e) => e.name));

  const toInsert = rows.filter((r) => {
    if (existingSet.has(r.name)) {
      bump(reasons, 'duplicate_name');
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) return 0;

  const result = await prisma.profile.createMany({
    data: toInsert.map((r) => ({
      id: r.id,
      name: r.name,
      gender: r.gender,
      gender_probability: r.gender_probability,
      age: r.age,
      age_group: r.age_group,
      country_id: r.country_id,
      country_name: r.country_name,
      country_probability: r.country_probability,
      ...(r.created_at ? { created_at: r.created_at } : {}),
    })),
    skipDuplicates: true,
  });

  const lost = toInsert.length - result.count;
  if (lost > 0) {
    reasons.duplicate_name = (reasons.duplicate_name ?? 0) + lost;
  }

  return result.count;
}

export function mergeReasons(target: IngestReasons, delta: IngestReasons) {
  for (const [k, v] of Object.entries(delta)) {
    if (v == null) continue;
    const key = k as IngestReasonKey;
    target[key] = (target[key] ?? 0) + v;
  }
}
