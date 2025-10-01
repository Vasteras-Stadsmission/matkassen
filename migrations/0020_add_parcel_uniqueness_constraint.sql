-- Migration: Add unique constraint to prevent duplicate parcels
-- This ensures idempotency for concurrent parcel creation operations

-- Step 1: Remove any existing duplicates (keep the oldest one for each group)
-- This is a safety measure in case duplicates already exist
DELETE FROM food_parcels
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY household_id, pickup_date_time_earliest, pickup_date_time_latest
                   ORDER BY id
               ) as rn
        FROM food_parcels
    ) t
    WHERE t.rn > 1
);

-- Step 2: Add unique constraint to prevent future duplicates
-- This constraint ensures that a household cannot have multiple parcels
-- with the same pickup time window
ALTER TABLE food_parcels
ADD CONSTRAINT food_parcels_household_time_unique
UNIQUE (household_id, pickup_date_time_earliest, pickup_date_time_latest);
