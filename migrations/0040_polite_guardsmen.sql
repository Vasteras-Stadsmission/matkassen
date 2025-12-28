ALTER TABLE "outgoing_sms" ADD COLUMN "dismissed_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "outgoing_sms" ADD COLUMN "dismissed_by_user_id" varchar(50);