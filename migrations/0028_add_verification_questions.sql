CREATE TABLE "pickup_location_verification_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"pickup_location_id" text NOT NULL,
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
ALTER TABLE "pickup_location_verification_questions" ADD CONSTRAINT "pickup_location_verification_questions_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_verification_questions_location" ON "pickup_location_verification_questions" USING btree ("pickup_location_id");--> statement-breakpoint
CREATE INDEX "idx_verification_questions_active_order" ON "pickup_location_verification_questions" USING btree ("pickup_location_id","is_active","display_order");