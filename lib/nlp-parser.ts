export function parseNaturalLanguage(query: string) {
  const q = query.toLowerCase();
  const filters: any = {};

  if (q.includes("male") && !q.includes("female")) filters.gender = "male";
  if (q.includes("female")) filters.gender = "female";
  if (q.includes("young")) { filters.min_age = "16"; filters.max_age = "24"; }
  

  // Age keywords
  const groups = ["child", "teenager", "adult", "senior"];
  groups.forEach(g => { if (q.includes(g)) filters.age_group = g; });

  // "Above X"
  const aboveMatch = q.match(/(?:above|over|older than)\s+(\d+)/);
  if (aboveMatch) filters.min_age = aboveMatch[1];

  // Country Map
  const countries: Record<string, string> = { "nigeria": "NG", "kenya": "KE", "angola": "AO" };
  Object.entries(countries).forEach(([name, id]) => {
    if (q.includes(name)) filters.country_id = id;
  });

  return Object.keys(filters).length > 0 ? filters : null;
}



// export function parseNaturalLanguage(query: string) {
//   const q = query.toLowerCase();
//   const filters: any = {};

//   // 1. Genders
//   if (q.includes("male") && !q.includes("female")) filters.gender = "male";
//   if (q.includes("female")) filters.gender = "female";

//   // 2. Age Groups
//   if (q.includes("child")) filters.age_group = "child";
//   if (q.includes("teenager")) filters.age_group = "teenager";
//   if (q.includes("adult")) filters.age_group = "adult";
//   if (q.includes("senior")) filters.age_group = "senior";

//   // 3. "Young" (16–24)
//   if (q.includes("young")) {
//     filters.min_age = 16;
//     filters.max_age = 24;
//   }

//   // 4. "Above X" or "Older than X"
//   const ageMatch = q.match(/(?:above|older than|over|more than)\s+(\d+)/);
//   if (ageMatch) filters.min_age = parseInt(ageMatch[1]);

//   // 5. Country IDs (Common ones, extend as needed)
//   const countryMap: Record<string, string> = {
//     "nigeria": "NG", "kenya": "KE", "angola": "AO", "ghana": "GH", "tanzania": "TZ", "uganda": "UG"
//   };
//   for (const [name, code] of Object.entries(countryMap)) {
//     if (q.includes(name)) filters.country_id = code;
//   }

//   if (Object.keys(filters).length === 0) return null;
//   return filters;
// }
