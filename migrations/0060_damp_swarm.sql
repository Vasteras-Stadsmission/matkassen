ALTER TABLE "users" DROP CONSTRAINT "users_favorite_pickup_location_id_pickup_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "favorite_pickup_location_id";