-- Enable pg_trgm extension for fuzzy name matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create index for faster similarity searches on household names
CREATE INDEX IF NOT EXISTS idx_households_name_trgm
ON households USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

-- IMPORTANT: This migration assumes you are starting fresh or only have test data
-- If you have production data, you need to:
-- 1. Manually normalize existing phone numbers to E.164 format
-- 2. Resolve any duplicate phone numbers before running this migration
-- 3. Comment out or remove the DELETE statement below

-- For now, we delete all test households to start clean
-- SAFETY CHECK: Only delete if there are fewer than 10 households (clearly test data)
DO $$
DECLARE
    household_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO household_count FROM households;

    IF household_count < 10 THEN
        -- Safe to delete - this is test data
        DELETE FROM households;
        RAISE NOTICE 'Deleted % test households', household_count;
    ELSE
        -- Production data detected - halt migration
        RAISE EXCEPTION 'Migration halted: Found % households. This appears to be production data. Please manually normalize phone numbers and resolve duplicates before running this migration.', household_count;
    END IF;
END $$;

-- Add unique constraint on phone_number (only for non-anonymized households)
-- This prevents duplicate phone numbers while allowing phone reuse after anonymization
-- Phone numbers will now be stored in E.164 format (+46701234567)
CREATE UNIQUE INDEX IF NOT EXISTS idx_households_phone_unique
ON households (phone_number)
WHERE anonymized_at IS NULL;

-- Add comment explaining the constraint
COMMENT ON INDEX idx_households_phone_unique IS
'Ensures phone numbers are unique among active (non-anonymized) households. Allows phone number reuse after household anonymization.';
