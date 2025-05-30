CREATE TABLE "csp_violations" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"blocked_uri" text,
	"violated_directive" text NOT NULL,
	"effective_directive" text,
	"original_policy" text,
	"disposition" varchar(10) NOT NULL,
	"referrer" text,
	"source_file" text,
	"line_number" integer,
	"column_number" integer,
	"user_agent" text,
	"script_sample" text
);
