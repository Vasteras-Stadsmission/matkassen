-- Add columns to track delivery status from SMS provider callbacks
-- provider_status: The delivery status text from HelloSMS (e.g., "Delivered", "Failed")
-- provider_status_updated_at: When the provider last sent a status update

ALTER TABLE "outgoing_sms" ADD COLUMN "provider_status" varchar(100);
ALTER TABLE "outgoing_sms" ADD COLUMN "provider_status_updated_at" timestamp(1) with time zone;

-- Add index on provider_message_id for efficient callback lookups
-- Only index non-null values since we only need to look up sent messages
CREATE INDEX "idx_outgoing_sms_provider_message_id" ON "outgoing_sms" ("provider_message_id") WHERE "provider_message_id" IS NOT NULL;
