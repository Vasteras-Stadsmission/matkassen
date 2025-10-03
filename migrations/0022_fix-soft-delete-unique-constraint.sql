-- Custom SQL migration file, put your code below! --

-- Fix soft-delete unique constraint issue
-- Problem: The original unique constraint applies to ALL rows (including soft-deleted ones),
-- which prevents recreating a parcel after soft-delete because the deleted row still
-- occupies the (household, location, time) slot.
--
-- Solution: Replace the standard unique constraint with a partial unique index that only
-- applies to active (non-deleted) parcels. This allows:
-- 1. Only one active parcel per (household, location, time) slot
-- 2. Multiple deleted parcels with the same values (historical data)
-- 3. Recreating a parcel after soft-deletion (critical business requirement)

-- Drop the existing unique constraint
ALTER TABLE "food_parcels" DROP CONSTRAINT "food_parcels_household_location_time_unique";--> statement-breakpoint

-- Create partial unique index (only enforced when deleted_at IS NULL)
CREATE UNIQUE INDEX "food_parcels_household_location_time_active_unique"
ON "food_parcels" ("household_id", "pickup_location_id", "pickup_date_time_earliest", "pickup_date_time_latest")
WHERE "deleted_at" IS NULL;
