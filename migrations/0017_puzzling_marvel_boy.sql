ALTER TABLE "outgoing_sms" ADD COLUMN "idempotency_key" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "outgoing_sms" ADD COLUMN "provider_message_id" varchar(50);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_outgoing_sms_idempotency_unique" ON "outgoing_sms" USING btree ("idempotency_key");