CREATE TYPE "public"."user_role" AS ENUM('admin', 'handout_staff');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role";--> statement-breakpoint
UPDATE "users" SET "role" = 'admin';--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'handout_staff';
