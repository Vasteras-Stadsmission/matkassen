CREATE TABLE "pickup_location_schedule_days" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"weekday" "weekday" NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	"opening_time" time,
	"closing_time" time,
	CONSTRAINT "opening_hours_check" CHECK (NOT "pickup_location_schedule_days"."is_open" OR ("pickup_location_schedule_days"."opening_time" IS NOT NULL AND "pickup_location_schedule_days"."closing_time" IS NOT NULL AND "pickup_location_schedule_days"."opening_time" < "pickup_location_schedule_days"."closing_time"))
);
--> statement-breakpoint
CREATE TABLE "pickup_location_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"pickup_location_id" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "schedule_date_range_check" CHECK ("pickup_location_schedules"."start_date" <= "pickup_location_schedules"."end_date")
);
--> statement-breakpoint
ALTER TABLE "pickup_location_schedule_days" ADD CONSTRAINT "pickup_location_schedule_days_schedule_id_pickup_location_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."pickup_location_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_location_schedules" ADD CONSTRAINT "pickup_location_schedules_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE cascade ON UPDATE no action;