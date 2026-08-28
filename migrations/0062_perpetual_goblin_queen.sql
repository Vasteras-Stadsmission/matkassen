ALTER TABLE "pickup_locations" DROP CONSTRAINT "pickup_locations_max_parcels_per_slot_check";--> statement-breakpoint
ALTER TABLE "pickup_locations" DROP COLUMN "max_parcels_per_slot";