-- Add sent_at timestamp to outgoing_sms table
-- This allows us to track when SMS was actually sent to the provider
ALTER TABLE "outgoing_sms" ADD COLUMN "sent_at" timestamp(1) with time zone;

-- Create index for efficient querying of sent SMS
CREATE INDEX "idx_outgoing_sms_sent_at" ON "outgoing_sms" ("sent_at") WHERE "sent_at" IS NOT NULL;
