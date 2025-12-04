CREATE TABLE "global_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"value" text,
	"updated_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"updated_by" varchar(50),
	CONSTRAINT "global_settings_key_unique" UNIQUE("key")
);
