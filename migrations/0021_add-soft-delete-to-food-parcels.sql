-- Add soft delete infrastructure to food_parcels table
ALTER TABLE "food_parcels" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "food_parcels" ADD COLUMN "deleted_by_user_id" varchar(50);--> statement-breakpoint

-- Add performance indexes for soft delete queries
-- Index for filtering non-deleted parcels (most common query pattern)
CREATE INDEX "idx_food_parcels_not_deleted" ON "food_parcels" ("household_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Index for finding deleted parcels (audit/admin queries)
CREATE INDEX "idx_food_parcels_deleted_at" ON "food_parcels" ("deleted_at") WHERE "deleted_at" IS NOT NULL;--> statement-breakpoint

-- Add 'cancelled' status to SMS enum
ALTER TYPE "sms_status" ADD VALUE 'cancelled';
