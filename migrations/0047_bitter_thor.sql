ALTER TABLE "additional_needs" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "additional_needs" ADD COLUMN "deactivated_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "additional_needs" ADD COLUMN "deactivated_by" varchar(50);--> statement-breakpoint
ALTER TABLE "dietary_restrictions" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "dietary_restrictions" ADD COLUMN "deactivated_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "dietary_restrictions" ADD COLUMN "deactivated_by" varchar(50);--> statement-breakpoint
ALTER TABLE "pet_species_types" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "pet_species_types" ADD COLUMN "deactivated_at" timestamp (1) with time zone;--> statement-breakpoint
ALTER TABLE "pet_species_types" ADD COLUMN "deactivated_by" varchar(50);