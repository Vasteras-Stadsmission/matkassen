-- Custom SQL migration file, put your code below! --

-- Clean up any legacy food parcels with 14-character IDs (should not exist, but defensive cleanup)
-- Food parcels should use nanoid(12) for IDs. Any 14-character IDs are legacy data.
-- This migration soft-deletes any parcels with non-standard ID lengths to ensure data integrity.

-- Soft delete parcels with incorrect ID length (not exactly 12 characters)
UPDATE food_parcels
SET
    deleted_at = NOW(),
    deleted_by_user_id = 'system_migration_0025'
WHERE
    LENGTH(id) != 12
    AND deleted_at IS NULL;  -- Only affect non-deleted parcels

-- Log the cleanup for monitoring
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO affected_count
    FROM food_parcels
    WHERE deleted_by_user_id = 'system_migration_0025';

    IF affected_count > 0 THEN
        RAISE NOTICE 'Migration 0025: Soft-deleted % legacy parcel(s) with non-standard ID length', affected_count;
    ELSE
        RAISE NOTICE 'Migration 0025: No legacy parcels found - all parcel IDs are correctly 12 characters';
    END IF;
END $$;
