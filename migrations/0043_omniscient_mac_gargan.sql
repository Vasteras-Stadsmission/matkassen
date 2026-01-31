ALTER TABLE "households" ADD COLUMN "noshow_followup_dismissed_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "noshow_followup_dismissed_by" varchar(50);