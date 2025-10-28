CREATE TABLE "household_verification_status" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"question_id" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_by_user" text,
	"verified_at" timestamp (1) with time zone,
	"notes" text,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_question_unique" UNIQUE("household_id","question_id")
);
--> statement-breakpoint
CREATE TABLE "verification_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"question_text_sv" text NOT NULL,
	"question_text_en" text NOT NULL,
	"help_text_sv" text,
	"help_text_en" text,
	"is_required" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (1) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "household_verification_status" ADD CONSTRAINT "household_verification_status_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_verification_status" ADD CONSTRAINT "household_verification_status_question_id_verification_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."verification_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_household_verification_household" ON "household_verification_status" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "idx_household_verification_status" ON "household_verification_status" USING btree ("household_id","is_verified");--> statement-breakpoint
CREATE INDEX "idx_global_verification_questions_active_order" ON "verification_questions" USING btree ("is_active","display_order");