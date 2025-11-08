ALTER TABLE "households" ADD COLUMN "created_by" varchar(50) DEFAULT 'unknown';--> statement-breakpoint
UPDATE "households" SET "created_by" = 'unknown' WHERE "created_by" IS NULL;
