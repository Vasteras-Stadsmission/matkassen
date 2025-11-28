-- Enable pg_trgm extension for fuzzy name matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create index for faster similarity searches on household names
CREATE INDEX IF NOT EXISTS idx_households_name_trgm
ON households USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- Delete all test households to start clean
-- This is safe because there is no production data yet
DELETE FROM households;

-- Add unique constraint on phone_number (only for non-anonymized households)
-- This prevents duplicate phone numbers while allowing phone reuse after anonymization
-- Phone numbers will now be stored in E.164 format (+46701234567)
CREATE UNIQUE INDEX IF NOT EXISTS idx_households_phone_unique
ON households (phone_number)
WHERE anonymized_at IS NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_households_phone_unique IS
'Ensures phone numbers are unique among active (non-anonymized) households. Allows phone number reuse after household anonymization.';
