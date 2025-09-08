CREATE TYPE "public"."sms_intent" AS ENUM('pickup_reminder', 'consent_enrolment');--> statement-breakpoint
CREATE TYPE "public"."sms_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'not_delivered', 'retrying', 'failed');--> statement-breakpoint
CREATE TABLE "outgoing_sms" (
	"id" text PRIMARY KEY NOT NULL,
	"intent" "sms_intent" NOT NULL,
	"parcel_id" text,
	"household_id" text NOT NULL,
	"to_e164" varchar(20) NOT NULL,
	"locale" varchar(2) NOT NULL,
	"text" text NOT NULL,
	"status" "sms_status" DEFAULT 'queued' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp (1) with time zone,
	"provider_message_id" varchar(100),
	"last_error_code" varchar(20),
	"last_error_message" text,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp (1) with time zone,
	"delivered_at" timestamp (1) with time zone,
	"failed_at" timestamp (1) with time zone
);
--> statement-breakpoint
ALTER TABLE "food_parcels" ADD COLUMN "picked_up_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "food_parcels" ADD COLUMN "picked_up_by_user_id" varchar(50);--> statement-breakpoint
ALTER TABLE "outgoing_sms" ADD CONSTRAINT "outgoing_sms_parcel_id_food_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."food_parcels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outgoing_sms" ADD CONSTRAINT "outgoing_sms_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_outgoing_sms_parcel_intent_unique" ON "outgoing_sms" USING btree ("intent","parcel_id");--> statement-breakpoint
CREATE INDEX "idx_outgoing_sms_status_next_attempt" ON "outgoing_sms" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "idx_outgoing_sms_provider_id" ON "outgoing_sms" USING btree ("provider_message_id");