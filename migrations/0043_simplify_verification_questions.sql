-- Custom SQL migration file, put your code below! --
-- Simplify verification questions: remove English columns, rename Swedish to generic

-- Step 1: Rename Swedish columns to generic names
ALTER TABLE "verification_questions" RENAME COLUMN "question_text_sv" TO "question_text";--> statement-breakpoint
ALTER TABLE "verification_questions" RENAME COLUMN "help_text_sv" TO "help_text";--> statement-breakpoint

-- Step 2: Drop English columns (data will be lost - this is intentional per user request)
ALTER TABLE "verification_questions" DROP COLUMN IF EXISTS "question_text_en";--> statement-breakpoint
ALTER TABLE "verification_questions" DROP COLUMN IF EXISTS "help_text_en";