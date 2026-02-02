ALTER TABLE "verification_questions" RENAME COLUMN "question_text_sv" TO "question_text";--> statement-breakpoint
ALTER TABLE "verification_questions" RENAME COLUMN "help_text_sv" TO "help_text";--> statement-breakpoint
ALTER TABLE "verification_questions" DROP COLUMN "question_text_en";--> statement-breakpoint
ALTER TABLE "verification_questions" DROP COLUMN "help_text_en";--> statement-breakpoint
ALTER TABLE "additional_needs" ADD CONSTRAINT "additional_needs_need_unique" UNIQUE("need");--> statement-breakpoint
ALTER TABLE "dietary_restrictions" ADD CONSTRAINT "dietary_restrictions_name_unique" UNIQUE("name");