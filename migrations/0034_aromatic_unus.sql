-- Enable pg_trgm extension for fuzzy name matching (similarity function)
-- This extension is required for the duplicate household name check
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN index for faster similarity searches on household names
CREATE INDEX IF NOT EXISTS idx_households_name_trgm
ON households USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Create unique index on phone_number for active (non-anonymized) households
-- This prevents duplicate phone numbers while allowing phone reuse after anonymization
CREATE UNIQUE INDEX "idx_households_phone_unique" ON "households" USING btree ("phone_number") WHERE "households"."anonymized_at" IS NULL;
