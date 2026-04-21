ALTER TABLE "households" DROP CONSTRAINT "households_responsible_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "idx_households_responsible_user";--> statement-breakpoint
UPDATE "households" AS h
SET "responsible_user_id" = u."id"
FROM "users" AS u
WHERE h."responsible_user_id" IS NULL
  AND h."created_by" = u."github_username";--> statement-breakpoint
ALTER TABLE "households" ALTER COLUMN "responsible_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_households_responsible_user" ON "households" USING btree ("responsible_user_id");
