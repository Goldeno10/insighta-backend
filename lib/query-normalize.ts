import type { Prisma } from '@/lib/generated/prisma/client';

/** Deterministic, canonical filter shape used for Prisma + cache keys. */
export type CanonicalProfileFilters = {
  gender?: 'male' | 'female';
  age_group?: 'child' | 'teenager' | 'adult' | 'senior';
  country_id?: string;
  min_age?: number;
  max_age?: number;
  min_gender_probability?: number;
  min_country_probability?: number;
};

export type NormalizedListQuery = {
  filters: CanonicalProfileFilters;
  sort_by: 'age' | 'created_at' | 'gender_probability';
  order: 'asc' | 'desc';
  page: number;
  limit: number;
};

const ALLOWED_SORT = ['age', 'created_at', 'gender_probability'] as const;

function roundProb(n: number): number {
  // Round probabilities to a fixed number of decimals to 
  //  ++ avoid tiny differences due to float parsing/coercion.
  return Math.round(n * 1e6) / 1e6;
}

/** Stable JSON for identical logical filters (fixed key order, no undefined). */
export function stableCanonicalJson(f: CanonicalProfileFilters): string {
  const keys = [
    'gender',
    'age_group',
    'country_id',
    'min_age',
    'max_age',
    'min_gender_probability',
    'min_country_probability',
  ] as const satisfies readonly (keyof CanonicalProfileFilters)[];
  const out: Record<string, number | string> = {};
  for (const k of keys) {
    const v = f[k];
    if (v === undefined) continue;
    out[k] = v;
  }
  return JSON.stringify(out);
}

export function listQuerySubCacheKey(q: NormalizedListQuery): string {
  return `${stableCanonicalJson(q.filters)}|sort=${q.sort_by}|order=${q.order}|page=${q.page}|limit=${q.limit}`;
}

export function searchQuerySubCacheKey(filters: CanonicalProfileFilters): string {
  // Search endpoint uses fixed page semantics (implicit first page, take=10) + stable sort.
  return `${stableCanonicalJson(filters)}|take=10|sort=created_at|order=desc`;
}

/** Parse GET /api/profiles query string into canonical form. */
export function normalizeListQueryFromSearchParams(searchParams: URLSearchParams): NormalizedListQuery {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '10', 10) || 10));

  const sortRaw = searchParams.get('sort_by') || 'created_at';
  const sort_by = (ALLOWED_SORT as readonly string[]).includes(sortRaw)
    ? (sortRaw as NormalizedListQuery['sort_by'])
    : 'created_at';
  const orderRaw = (searchParams.get('order') || 'desc').toLowerCase();
  const order: 'asc' | 'desc' = orderRaw === 'asc' ? 'asc' : 'desc';

  const filters = normalizeFilterFields({
    gender: searchParams.get('gender') ?? undefined,
    age_group: searchParams.get('age_group') ?? undefined,
    country_id: searchParams.get('country_id') ?? undefined,
    min_age: searchParams.get('min_age') ?? undefined,
    max_age: searchParams.get('max_age') ?? undefined,
    min_gender_probability: searchParams.get('min_gender_probability') ?? undefined,
    min_country_probability: searchParams.get('min_country_probability') ?? undefined,
  });

  return { filters, sort_by, order, page, limit };
}

export type RawFilterInput = {
  gender?: string;
  age_group?: string;
  country_id?: string;
  min_age?: string | number;
  max_age?: string | number;
  min_gender_probability?: string | number;
  min_country_probability?: string | number;
};

/**
 * Normalize arbitrary filter inputs (URL params or NLP parser output) into one canonical object.
 * Invalid fields are omitted (never coerced into guesses).
 */
export function normalizeFilterFields(raw: RawFilterInput): CanonicalProfileFilters {
  const out: CanonicalProfileFilters = {};

  if (raw.gender !== undefined && raw.gender !== null && String(raw.gender).trim() !== '') {
    const g = String(raw.gender).trim().toLowerCase();
    if (g === 'male' || g === 'female') out.gender = g;
  }

  if (raw.age_group !== undefined && raw.age_group !== null && String(raw.age_group).trim() !== '') {
    const ag = String(raw.age_group).trim().toLowerCase();
    if (ag === 'child' || ag === 'teenager' || ag === 'adult' || ag === 'senior') {
      out.age_group = ag;
    }
  }

  if (raw.country_id !== undefined && raw.country_id !== null && String(raw.country_id).trim() !== '') {
    const cid = String(raw.country_id).trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(cid)) out.country_id = cid;
  }

  let minAge: number | undefined;
  let maxAge: number | undefined;
  if (raw.min_age !== undefined && raw.min_age !== null && String(raw.min_age).trim() !== '') {
    const n = typeof raw.min_age === 'number' ? raw.min_age : parseInt(String(raw.min_age), 10);
    if (Number.isFinite(n)) minAge = n;
  }
  if (raw.max_age !== undefined && raw.max_age !== null && String(raw.max_age).trim() !== '') {
    const n = typeof raw.max_age === 'number' ? raw.max_age : parseInt(String(raw.max_age), 10);
    if (Number.isFinite(n)) maxAge = n;
  }
  if (minAge !== undefined && maxAge !== undefined && minAge > maxAge) {
    const t = minAge;
    minAge = maxAge;
    maxAge = t;
  }
  if (minAge !== undefined) out.min_age = minAge;
  if (maxAge !== undefined) out.max_age = maxAge;

  if (
    raw.min_gender_probability !== undefined &&
    raw.min_gender_probability !== null &&
    String(raw.min_gender_probability).trim() !== ''
  ) {
    const n =
      typeof raw.min_gender_probability === 'number'
        ? raw.min_gender_probability
        : parseFloat(String(raw.min_gender_probability));
    if (Number.isFinite(n) && n >= 0 && n <= 1) out.min_gender_probability = roundProb(n);
  }

  if (
    raw.min_country_probability !== undefined &&
    raw.min_country_probability !== null &&
    String(raw.min_country_probability).trim() !== ''
  ) {
    const n =
      typeof raw.min_country_probability === 'number'
        ? raw.min_country_probability
        : parseFloat(String(raw.min_country_probability));
    if (Number.isFinite(n) && n >= 0 && n <= 1) out.min_country_probability = roundProb(n);
  }

  return out;
}

export function prismaWhereFromCanonical(f: CanonicalProfileFilters): Prisma.ProfileWhereInput {
  const where: Prisma.ProfileWhereInput = {};
  if (f.gender) where.gender = f.gender;
  if (f.age_group) where.age_group = f.age_group;
  if (f.country_id) where.country_id = f.country_id;
  if (f.min_age !== undefined || f.max_age !== undefined) {
    where.age = {};
    if (f.min_age !== undefined) where.age.gte = f.min_age;
    if (f.max_age !== undefined) where.age.lte = f.max_age;
  }
  if (f.min_gender_probability !== undefined) {
    where.gender_probability = { gte: f.min_gender_probability };
  }
  if (f.min_country_probability !== undefined) {
    where.country_probability = { gte: f.min_country_probability };
  }
  return where;
}
