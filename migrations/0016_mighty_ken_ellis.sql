-- Drop indexes first
DROP INDEX IF EXISTS "idx_outgoing_sms_status_next_attempt";--> statement-breakpoint
DROP INDEX IF EXISTS "idx_outgoing_sms_provider_id";--> statement-breakpoint

-- Drop columns first
ALTER TABLE "outgoing_sms" DROP COLUMN IF EXISTS "locale";--> statement-breakpoint
ALTER TABLE "outgoing_sms" DROP COLUMN IF EXISTS "provider_message_id";--> statement-breakpoint
ALTER TABLE "outgoing_sms" DROP COLUMN IF EXISTS "last_error_code";--> statement-breakpoint
ALTER TABLE "outgoing_sms" DROP COLUMN IF EXISTS "subject";--> statement-breakpoint
ALTER TABLE "outgoing_sms" DROP COLUMN IF EXISTS "callback_ref";--> statement-breakpoint
ALTER TABLE "outgoing_sms" DROP COLUMN IF EXISTS "sent_at";--> statement-breakpoint
ALTER TABLE "outgoing_sms" DROP COLUMN IF EXISTS "delivered_at";--> statement-breakpoint
ALTER TABLE "outgoing_sms" DROP COLUMN IF EXISTS "failed_at";--> statement-breakpoint

-- Convert status column to text temporarily
ALTER TABLE "public"."outgoing_sms" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint

-- Drop and recreate the enum type
DROP TYPE IF EXISTS "public"."sms_status" CASCADE;--> statement-breakpoint
CREATE TYPE "public"."sms_status" AS ENUM('queued', 'sending', 'sent', 'retrying', 'failed');--> statement-breakpoint

-- Convert status column back to enum
ALTER TABLE "public"."outgoing_sms" ALTER COLUMN "status" SET DATA TYPE "public"."sms_status" USING "status"::"public"."sms_status";--> statement-breakpoint

-- Set default value for status column
ALTER TABLE "public"."outgoing_sms" ALTER COLUMN "status" SET DEFAULT 'queued'::"public"."sms_status";--> statement-breakpoint

-- Create new index
CREATE INDEX "idx_outgoing_sms_ready_to_send" ON "outgoing_sms" USING btree ("status","next_attempt_at");--> statement-breakpoint
