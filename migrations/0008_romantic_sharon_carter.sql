CREATE TYPE "public"."weekday" AS ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');--> statement-breakpoint
CREATE TABLE "pickup_location_special_opening_days" (
	"id" text PRIMARY KEY NOT NULL,
	"pickup_location_id" text NOT NULL,
	"date" date NOT NULL,
	"opening_time" time NOT NULL,
	"closing_time" time NOT NULL,
	"is_closed" boolean DEFAULT false,
	CONSTRAINT "special_opening_hours_check" CHECK ("pickup_location_special_opening_days"."is_closed" OR "pickup_location_special_opening_days"."opening_time" < "pickup_location_special_opening_days"."closing_time")
);
--> statement-breakpoint
CREATE TABLE "pickup_location_weekly_opening_hours" (
	"id" text PRIMARY KEY NOT NULL,
	"pickup_location_id" text NOT NULL,
	"weekday" "weekday" NOT NULL,
	"opening_time" time NOT NULL,
	"closing_time" time NOT NULL,
	CONSTRAINT "opening_hours_check" CHECK ("pickup_location_weekly_opening_hours"."opening_time" < "pickup_location_weekly_opening_hours"."closing_time")
);
--> statement-breakpoint
ALTER TABLE "pickup_locations" ADD COLUMN "default_slot_duration_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_location_special_opening_days" ADD CONSTRAINT "pickup_location_special_opening_days_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_location_weekly_opening_hours" ADD CONSTRAINT "pickup_location_weekly_opening_hours_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE cascade ON UPDATE no action;