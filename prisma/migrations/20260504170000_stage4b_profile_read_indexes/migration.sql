-- Stage 4B: read-path indexes for common filters and sorts (Postgres).
CREATE INDEX IF NOT EXISTS "Profile_country_id_gender_age_idx" ON "Profile" ("country_id", "gender", "age");
CREATE INDEX IF NOT EXISTS "Profile_created_at_idx" ON "Profile" ("created_at");
CREATE INDEX IF NOT EXISTS "Profile_gender_probability_idx" ON "Profile" ("gender_probability");
CREATE INDEX IF NOT EXISTS "Profile_age_group_idx" ON "Profile" ("age_group");
