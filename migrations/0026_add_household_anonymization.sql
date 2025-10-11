ALTER TABLE "households" ADD COLUMN "anonymized_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "anonymized_by" varchar(50);