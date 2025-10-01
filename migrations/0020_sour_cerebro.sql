-- Step 1: Remove any existing duplicates (keep the oldest one for each group)
-- This is a safety measure in case duplicates already exist
-- Group by household, location, and time window
DELETE FROM food_parcels
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY household_id, pickup_location_id, pickup_date_time_earliest, pickup_date_time_latest
                   ORDER BY id
               ) as rn
        FROM food_parcels
    ) t
    WHERE t.rn > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "food_parcels_household_location_time_unique" ON "food_parcels" USING btree ("household_id","pickup_location_id","pickup_date_time_earliest","pickup_date_time_latest");
