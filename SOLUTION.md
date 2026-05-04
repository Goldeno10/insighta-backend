# Stage 4B — System Optimization & Data Ingestion

This document explains the implementation for **query performance**, **query normalization / caching**, and **large CSV ingestion**, plus trade-offs and how to apply database changes.

---

## 1. Query performance & database efficiency

### What changed

1. **PostgreSQL indexes (read path)**  
   Added composite and single-column indexes aligned with real filters and sorts used by `GET /api/profiles` and search:
   - `(country_id, gender, age)` — common combined filters  
   - `created_at` — default sort  
   - `gender_probability` — sort / threshold filter  
   - `age_group` — filter  

   **Why:** At millions of rows, sequential scans on `Profile` dominate latency. These indexes keep filter + sort plans index-friendly without adding new infrastructure.

2. **Redis response caching**  
   - `GET /api/profiles` — full JSON response (including `pagination.total`) cached under a key derived from **canonical** query parameters (see §2). TTL **45s**.  
   - `GET /api/profiles/search` — cached with canonical parsed filters + fixed semantics (`take=10`, `orderBy created_at desc`). TTL **45s**.  
   - `GET /api/profiles/[id]` — cached by id. TTL **90s**.  

   **Why:** Repeated identical reads (especially from CLI + web) were hitting Neon on every request. Short TTLs bound staleness while cutting DB QPS sharply.

3. **Cache invalidation (correctness)**  
   A Redis counter `profile:data_version` is **incremented** when profiles change (`POST /api/profiles` create, `DELETE /api/profiles/[id]`, and after a successful bulk import with `inserted > 0`). Cache keys include this version, so mutations do not serve stale list/search/id payloads indefinitely.

4. **`GET /api/profiles/[id]` query shape**  
   Replaced `$queryRaw` with `findMany({ where: { id }, take: 1 })` so Prisma uses the primary key and returns the same `data` array shape as before.

5. **CORS preflight vs auth**  
   In `proxy.ts`, `OPTIONS` requests to `/api/*` bypass JWT checks so browsers can preflight `Authorization` + `X-API-Version` without failing.

6. **Next.js 16 boundary**  
   The project uses **`proxy.ts` with `export default`** (not `middleware.ts`) as required by Next 16.

### Connection pooling (you should configure in Neon)

The app already uses **Neon serverless** via `@prisma/adapter-neon`. For high read/write concurrency, point `DATABASE_URL` at Neon’s **pooler** host (Neon documents this as `-pooler` in the hostname) and keep `DATABASE_URL_UNPOOLED` for migrations (`prisma.config.ts`). This reduces connection churn under load without changing application code.

### Before / after (indicative)

Measurements depend on dataset size, region, and cache hit rate. Example pattern on a warm cache vs cold DB:

| Scenario | Before (typical) | After (typical) |
|----------|------------------|-----------------|
| `GET /api/profiles` same filters ×20 (cold cache) | DB hit every time; higher p95 | First hit DB; next 19 from Redis |
| `GET /api/profiles` with selective filters on large table | Seq scan risk without indexes | Index scan + smaller working set |
| `GET /api/profiles/[id]` repeat | DB round-trip each time | Redis hit after first request |

Reproduce locally: run the same `curl` twice and compare response times; second request should be noticeably faster when Redis is enabled.

---

## 2. Query normalization & cache efficiency

### Problem

Different phrasings must map to the **same** logical filters and therefore the **same** cache key (deterministic, no LLMs).

### Approach

1. **`lib/query-normalize.ts`**  
   - `normalizeFilterFields()` coerces URL / parser output into a **`CanonicalProfileFilters`** object: known enums only (`gender`, `age_group`), ISO2 `country_id`, integer ages with **min/max swapped** if reversed, probabilities rounded to 6 decimals and clamped to `[0,1]`, invalid fields **dropped** (never guessed).  
   - `normalizeListQueryFromSearchParams()` normalizes pagination + sort + filters.  
   - `stableCanonicalJson()` emits JSON with **fixed key order** so two equivalent filters stringify identically.

2. **`lib/nlp-parser.ts`**  
   Deterministic rules only: word-boundary gender synonyms (`women`, `females`, `men`, …), `between X and Y` age ranges, existing keyword rules, and **country aliases** from `lib/country-aliases.ts` (longest phrase first, e.g. “south africa” before shorter tokens).

3. **Cache keys**  
   Built from `profile:data_version` + subkeys like  
   `list:<stableCanonicalJson>|sort=...|page=...|limit=...`  
   and  
   `search:<stableCanonicalJson>|take=10|sort=created_at|order=desc`.

### Trade-offs

- **Search `orderBy`:** Search now uses explicit `created_at desc` for stable ordering and cacheability. That is a small behavioral tightening vs an undefined DB order.  
- **Normalization is conservative:** Unknown `gender` strings are omitted rather than coerced, avoiding false positives.

---

## 3. Large-scale CSV ingestion

### Endpoint

`POST /api/profiles/import`  
- **Auth:** Same as other `/api/*` routes (JWT + `X-API-Version: 1`). **Admin only** (matches `POST /api/profiles` create semantics under RBAC).  
- **Body:** `multipart/form-data` with a **file** field containing CSV (`.csv` or `text/csv`).  
- **Runtime:** `nodejs` (streaming + `busboy` + `csv-parse`).

### Requirements mapping

| Requirement | Implementation |
|-------------|----------------|
| Not row-by-row inserts | `createMany` in chunks of **800** rows |
| Not loading whole file in memory | `busboy` file stream → `csv-parse` stream |
| Streaming / chunked | Parser `for await` + batch buffer |
| Concurrent uploads | No global lock; each request streams independently; DB uniqueness on `name` + `skipDuplicates` handles races |
| Bad rows don’t fail whole file | Validate per row; count skip reasons; continue |
| No rollback on partial failure | Each `createMany` commits independently |
| Duplicate names | Pre-check `name IN (...)` per batch + `skipDuplicates` for race safety |

### Response shape

Matches the task example:

```json
{
  "status": "success",
  "total_rows": 50000,
  "inserted": 48231,
  "skipped": 1769,
  "reasons": { "duplicate_name": 1203, "invalid_age": 312, "missing_fields": 254 }
}
```

`reasons` omits zero-valued keys. Extra keys may appear (`invalid_gender`, `invalid_country`, `invalid_probability`, `invalid_age_group`, `malformed_row`) when applicable.

### Edge cases

- **Malformed CSV lines:** `csv-parse` with `skip_records_with_error` + `skip` handler → `malformed_row`.  
- **Duplicate name in file:** second and later rows → `duplicate_name`.  
- **Duplicate name in DB:** counted in batch pre-check; remaining races → `skipDuplicates` + `lost` accounting.  
- **Invalid UUID in optional `id` column:** replaced with a new UUID v7.  
- **Import completes with `inserted === 0`:** cache version **not** bumped (no data changed).

### Trade-offs

- **Long request:** A 500k-row upload is one HTTP request; `maxDuration = 300` helps on hosts that honor it. For very slow networks, clients may still need retries.  
- **Multipart only:** Raw `text/csv` body without multipart is rejected with `400` to keep parsing unambiguous.

---
