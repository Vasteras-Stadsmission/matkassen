CREATE TABLE "schedule_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text,
	"pickup_location_id" text NOT NULL,
	"action" text NOT NULL,
	"changed_by" varchar(50) NOT NULL,
	"changed_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"changes_summary" text
);
--> statement-breakpoint
ALTER TABLE "pickup_location_schedules" ADD COLUMN "created_at" timestamp (1) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "pickup_location_schedules" ADD COLUMN "created_by" varchar(50);--> statement-breakpoint
ALTER TABLE "pickup_location_schedules" ADD COLUMN "updated_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "pickup_location_schedules" ADD COLUMN "updated_by" varchar(50);--> statement-breakpoint
ALTER TABLE "schedule_audit_log" ADD CONSTRAINT "schedule_audit_log_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_schedule_audit_log_location" ON "schedule_audit_log" USING btree ("pickup_location_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_audit_log_schedule" ON "schedule_audit_log" USING btree ("schedule_id");