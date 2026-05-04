/**
 * Deterministic country resolution for rule-based queries.
 * Longer phrases are matched first so e.g. "south africa" wins over "africa".
 */
const ENTRIES: readonly [needle: string, iso2: string][] = [
  ['south africa', 'ZA'],
  ['united kingdom', 'GB'],
  ['united states', 'US'],
  ['great britain', 'GB'],
  ['england', 'GB'],
  ['scotland', 'GB'],
  ['wales', 'GB'],
  ['tanzania', 'TZ'],
  ['nigeria', 'NG'],
  ['kenya', 'KE'],
  ['angola', 'AO'],
  ['ghana', 'GH'],
  ['uganda', 'UG'],
  ['canada', 'CA'],
];

const SORTED = [...ENTRIES].sort((a, b) => b[0].length - a[0].length);

export function resolveCountryIdFromText(query: string): string | undefined {
  const q = query.toLowerCase();
  for (const [needle, iso] of SORTED) {
    if (q.includes(needle)) return iso;
  }
  return undefined;
}
