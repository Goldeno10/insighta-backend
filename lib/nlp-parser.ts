import type { RawFilterInput } from '@/lib/query-normalize';
import { resolveCountryIdFromText } from '@/lib/country-aliases';

/**
 * Rule-based mapping from free text to structured filter fields.
 * Callers should pass the result through `normalizeFilterFields` for canonical/cache use.
 */
export function parseNaturalLanguage(query: string): RawFilterInput | null {
  const q = query.toLowerCase();
  const filters: RawFilterInput = {};

  // Gender: check female patterns before male to avoid "female" matching "male".
  if (/\b(females?|women|female)\b/.test(q)) filters.gender = 'female';
  else if (/\b(males?|men|male)\b/.test(q)) filters.gender = 'male';

  if (q.includes('young')) {
    filters.min_age = '16';
    filters.max_age = '24';
  }

  const groups = ['child', 'teenager', 'adult', 'senior'] as const;
  for (const g of groups) {
    if (q.includes(g)) filters.age_group = g;
  }

  const aboveMatch = q.match(/(?:above|over|older than)\s+(\d+)/);
  if (aboveMatch) filters.min_age = aboveMatch[1];

  const between = q.match(/\b(?:between|from)\s+(\d+)\s*(?:and|-|to)\s+(\d+)\b/);
  if (between) {
    filters.min_age = between[1];
    filters.max_age = between[2];
  }

  const country = resolveCountryIdFromText(query);
  if (country) filters.country_id = country;

  return Object.keys(filters).length > 0 ? filters : null;
}
