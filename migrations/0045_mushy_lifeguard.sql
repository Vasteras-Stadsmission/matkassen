CREATE TABLE "user_agreement_acceptances" (
	"user_id" text NOT NULL,
	"agreement_id" text NOT NULL,
	"accepted_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_agreement_acceptances_user_id_agreement_id_pk" PRIMARY KEY("user_id","agreement_id")
);
--> statement-breakpoint
CREATE TABLE "user_agreements" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (6) with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(50)
);
--> statement-breakpoint
ALTER TABLE "user_agreement_acceptances" ADD CONSTRAINT "user_agreement_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_agreement_acceptances" ADD CONSTRAINT "user_agreement_acceptances_agreement_id_user_agreements_id_fk" FOREIGN KEY ("agreement_id") REFERENCES "public"."user_agreements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_user_agreement_acceptances_user" ON "user_agreement_acceptances" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_agreements_effective_from" ON "user_agreements" USING btree ("effective_from");