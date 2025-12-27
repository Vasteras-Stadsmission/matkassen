ALTER TABLE "outgoing_sms" ADD COLUMN "provider_status" varchar(100);--> statement-breakpoint
ALTER TABLE "outgoing_sms" ADD COLUMN "provider_status_updated_at" timestamp (1) with time zone;--> statement-breakpoint
CREATE INDEX "idx_outgoing_sms_provider_message_id" ON "outgoing_sms" USING btree ("provider_message_id") WHERE "outgoing_sms"."provider_message_id" IS NOT NULL;