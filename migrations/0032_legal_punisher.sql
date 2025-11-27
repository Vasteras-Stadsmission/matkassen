CREATE TABLE "global_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"updated_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(50),
	CONSTRAINT "global_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "created_by" varchar(50);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" varchar(255);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_url" text;