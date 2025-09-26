ALTER TABLE "users" DROP CONSTRAINT "users_preferred_pickup_location_id_pickup_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "favorite_pickup_location_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_favorite_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("favorite_pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "preferred_pickup_location_id";