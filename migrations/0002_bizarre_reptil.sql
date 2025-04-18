ALTER TABLE "food_parcels" RENAME COLUMN "pickup_location" TO "pickup_location_id";--> statement-breakpoint
ALTER TABLE "food_parcels" DROP CONSTRAINT "food_parcels_url_uid_unique";--> statement-breakpoint
ALTER TABLE "households" DROP CONSTRAINT "postal_code_check";--> statement-breakpoint
ALTER TABLE "pickup_locations" DROP CONSTRAINT "postal_code_check";--> statement-breakpoint
ALTER TABLE "pickup_locations" DROP CONSTRAINT "email_format_check";--> statement-breakpoint
ALTER TABLE "food_parcels" DROP CONSTRAINT "food_parcels_pickup_location_pickup_locations_id_fk";
--> statement-breakpoint
ALTER TABLE "food_parcels" DROP CONSTRAINT "food_parcels_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "household_additional_needs" DROP CONSTRAINT "household_additional_needs_household_id_fk";
--> statement-breakpoint
ALTER TABLE "household_additional_needs" DROP CONSTRAINT "household_additional_needs_need_id_fk";
--> statement-breakpoint
ALTER TABLE "household_additional_needs" DROP CONSTRAINT "household_additional_needs_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "household_additional_needs" DROP CONSTRAINT "household_additional_needs_additional_need_id_additional_needs_id_fk";
--> statement-breakpoint
ALTER TABLE "household_comments" DROP CONSTRAINT "household_comments_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" DROP CONSTRAINT "household_dietary_restrictions_household_id_fk";
--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" DROP CONSTRAINT "household_dietary_restrictions_restriction_id_fk";
--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" DROP CONSTRAINT "household_dietary_restrictions_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" DROP CONSTRAINT "household_dietary_restrictions_dietary_restriction_id_dietary_restrictions_id_fk";
--> statement-breakpoint
ALTER TABLE "household_members" DROP CONSTRAINT "household_members_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "pets" DROP CONSTRAINT "pets_household_id_households_id_fk";
--> statement-breakpoint
ALTER TABLE "household_members" ALTER COLUMN "sex" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ALTER COLUMN "postal_code" SET DATA TYPE varchar(5);--> statement-breakpoint
ALTER TABLE "pickup_locations" ALTER COLUMN "postal_code" SET DATA TYPE varchar(5);--> statement-breakpoint

-- Drop the existing primary key first, before adding a composite one
ALTER TABLE "household_additional_needs" DROP CONSTRAINT "household_additional_needs_pkey";--> statement-breakpoint
ALTER TABLE "household_additional_needs" ADD CONSTRAINT "household_additional_needs_household_id_additional_need_id_pk" PRIMARY KEY("household_id","additional_need_id");--> statement-breakpoint

-- Drop primary key on household_dietary_restrictions too
ALTER TABLE "household_dietary_restrictions" DROP CONSTRAINT "household_dietary_restrictions_pkey";--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" ADD CONSTRAINT "household_dietary_restrictions_household_id_dietary_restriction_id_pk" PRIMARY KEY("household_id","dietary_restriction_id");--> statement-breakpoint

ALTER TABLE "food_parcels" ADD CONSTRAINT "food_parcels_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_parcels" ADD CONSTRAINT "food_parcels_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_additional_needs" ADD CONSTRAINT "household_additional_needs_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_additional_needs" ADD CONSTRAINT "household_additional_needs_additional_need_id_additional_needs_id_fk" FOREIGN KEY ("additional_need_id") REFERENCES "public"."additional_needs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_comments" ADD CONSTRAINT "household_comments_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" ADD CONSTRAINT "household_dietary_restrictions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" ADD CONSTRAINT "household_dietary_restrictions_dietary_restriction_id_dietary_restrictions_id_fk" FOREIGN KEY ("dietary_restriction_id") REFERENCES "public"."dietary_restrictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_parcels" DROP COLUMN "url_uid";--> statement-breakpoint
ALTER TABLE "household_additional_needs" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "household_dietary_restrictions" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "food_parcels" ADD CONSTRAINT "pickup_time_range_check" CHECK ("food_parcels"."pickup_date_time_earliest" <= "food_parcels"."pickup_date_time_latest");--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_postal_code_check" CHECK (LENGTH("households"."postal_code") = 5 AND "households"."postal_code" ~ '^[0-9]{5}$');--> statement-breakpoint
ALTER TABLE "pickup_locations" ADD CONSTRAINT "pickup_locations_postal_code_check" CHECK (LENGTH("pickup_locations"."postal_code") = 5 AND "pickup_locations"."postal_code" ~ '^[0-9]{5}$');--> statement-breakpoint
ALTER TABLE "pickup_locations" ADD CONSTRAINT "pickup_locations_email_format_check" CHECK ("pickup_locations"."contact_email" ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');
