CREATE TABLE "noshow_followup_dismissals" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"dismissed_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"dismissed_by_user_id" varchar(50)
);
--> statement-breakpoint
ALTER TABLE "noshow_followup_dismissals" ADD CONSTRAINT "noshow_followup_dismissals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_noshow_followup_dismissals_household" ON "noshow_followup_dismissals" USING btree ("household_id");