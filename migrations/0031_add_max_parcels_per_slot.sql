-- Add max_parcels_per_slot column to pickup_locations table
-- This allows each location to have its own configurable slot capacity limit
-- Null means no limit, positive integers define the maximum parcels allowed per time slot
ALTER TABLE "pickup_locations" ADD COLUMN "max_parcels_per_slot" integer DEFAULT 4;

-- Add check constraint to ensure max_parcels_per_slot is positive when not null
ALTER TABLE "pickup_locations" ADD CONSTRAINT "pickup_locations_max_parcels_per_slot_check" CHECK ("max_parcels_per_slot" IS NULL OR "max_parcels_per_slot" > 0);
