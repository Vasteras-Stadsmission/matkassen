ALTER TYPE "public"."sms_intent" ADD VALUE 'food_parcels_ended';--> statement-breakpoint
ALTER TABLE "food_parcels" ADD COLUMN "no_show_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "food_parcels" ADD COLUMN "no_show_by_user_id" varchar(50);--> statement-breakpoint
ALTER TABLE "food_parcels" ADD CONSTRAINT "no_show_pickup_exclusivity_check" CHECK (NOT ("food_parcels"."no_show_at" IS NOT NULL AND "food_parcels"."is_picked_up" = true));