ALTER TYPE "public"."sms_intent" ADD VALUE 'enrolment';--> statement-breakpoint
CREATE TABLE "privacy_policies" (
	"language" varchar(5) NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(50),
	CONSTRAINT "privacy_policies_language_created_at_pk" PRIMARY KEY("language","created_at")
);
