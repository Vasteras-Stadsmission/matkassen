CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"github_username" varchar(100) NOT NULL,
	"preferred_pickup_location_id" text,
	CONSTRAINT "users_github_username_unique" UNIQUE("github_username")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_preferred_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("preferred_pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE set null ON UPDATE no action;