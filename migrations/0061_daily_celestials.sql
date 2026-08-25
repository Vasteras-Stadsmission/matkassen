CREATE TABLE "pickup_location_daily_limits" (
	"pickup_location_id" text NOT NULL,
	"date" date NOT NULL,
	"max_parcels" integer NOT NULL,
	CONSTRAINT "pickup_location_daily_limits_pk" PRIMARY KEY("pickup_location_id","date"),
	CONSTRAINT "pickup_location_daily_limits_max_parcels_check" CHECK ("pickup_location_daily_limits"."max_parcels" > 0)
);
--> statement-breakpoint
ALTER TABLE "pickup_location_daily_limits" ADD CONSTRAINT "pickup_location_daily_limits_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_locations" ADD CONSTRAINT "pickup_locations_parcels_max_per_day_check" CHECK ("pickup_locations"."parcels_max_per_day" IS NULL OR "pickup_locations"."parcels_max_per_day" > 0);