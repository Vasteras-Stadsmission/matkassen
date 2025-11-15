ALTER TABLE "households" DROP CONSTRAINT "households_postal_code_check";--> statement-breakpoint
ALTER TABLE "households" ALTER COLUMN "postal_code" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_postal_code_check" CHECK ("households"."postal_code" IS NULL OR (LENGTH("households"."postal_code") = 5 AND "households"."postal_code" ~ '^[0-9]{5}$'));