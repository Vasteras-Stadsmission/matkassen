CREATE TYPE "public"."pet_species" AS ENUM('dog', 'cat', 'bunny', 'bird');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TABLE "additional_needs" (
	"id" text PRIMARY KEY NOT NULL,
	"need" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dietary_restrictions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_parcels" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"pickup_location" text NOT NULL,
	"pickup_date_time_earliest" timestamp (0) with time zone NOT NULL,
	"pickup_date_time_latest" timestamp (0) with time zone NOT NULL,
	"is_picked_up" boolean DEFAULT false NOT NULL,
	"url_uid" text NOT NULL,
	CONSTRAINT "food_parcels_url_uid_unique" UNIQUE("url_uid")
);
--> statement-breakpoint
CREATE TABLE "household_additional_needs" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"additional_need_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_comments" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"comment" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_dietary_restrictions" (
	"id" text PRIMARY KEY NOT NULL,
	"household_id" text NOT NULL,
	"dietary_restriction_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"household_id" text NOT NULL,
	"age" integer NOT NULL,
	"sex" "sex"
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"first_name" varchar(50) NOT NULL,
	"last_name" varchar(50) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"locale" varchar(2) NOT NULL,
	"postal_code" integer NOT NULL,
	CONSTRAINT "postal_code_check" CHECK ("households"."postal_code" BETWEEN 10000 AND 99999)
);
--> statement-breakpoint
CREATE TABLE "pets" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp (1) with time zone DEFAULT now() NOT NULL,
	"household_id" text NOT NULL,
	"species" "pet_species" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"street_address" text NOT NULL,
	"postal_code" integer NOT NULL,
	"parcels_max_per_day" integer,
	"contact_name" varchar(50),
	"contact_email" varchar(255),
	"contact_phone_number" varchar(20),
	CONSTRAINT "postal_code_check" CHECK ("pickup_locations"."postal_code" BETWEEN 10000 AND 99999),
	CONSTRAINT "email_format_check" CHECK ("pickup_locations"."contact_email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);
--> statement-breakpoint
DROP TABLE "todos" CASCADE;--> statement-breakpoint
ALTER TABLE "food_parcels" ADD CONSTRAINT "food_parcels_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_parcels" ADD CONSTRAINT "food_parcels_pickup_location_pickup_locations_id_fk" FOREIGN KEY ("pickup_location") REFERENCES "public"."pickup_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_additional_needs" ADD CONSTRAINT "household_additional_needs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_additional_needs" ADD CONSTRAINT "household_additional_needs_additional_need_id_additional_needs_id_fk" FOREIGN KEY ("additional_need_id") REFERENCES "public"."additional_needs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_additional_needs" ADD CONSTRAINT "household_additional_needs_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_additional_needs" ADD CONSTRAINT "household_additional_needs_need_id_fk" FOREIGN KEY ("additional_need_id") REFERENCES "public"."additional_needs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_comments" ADD CONSTRAINT "household_comments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" ADD CONSTRAINT "household_dietary_restrictions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" ADD CONSTRAINT "household_dietary_restrictions_dietary_restriction_id_dietary_restrictions_id_fk" FOREIGN KEY ("dietary_restriction_id") REFERENCES "public"."dietary_restrictions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" ADD CONSTRAINT "household_dietary_restrictions_household_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" ADD CONSTRAINT "household_dietary_restrictions_restriction_id_fk" FOREIGN KEY ("dietary_restriction_id") REFERENCES "public"."dietary_restrictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;