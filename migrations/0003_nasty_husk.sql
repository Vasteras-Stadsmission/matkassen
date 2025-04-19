CREATE TABLE "pet_species_types" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pets" ADD COLUMN "pet_species_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "pets" ADD CONSTRAINT "pets_pet_species_id_pet_species_types_id_fk" FOREIGN KEY ("pet_species_id") REFERENCES "public"."pet_species_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pets" DROP COLUMN "species";--> statement-breakpoint
DROP TYPE "public"."pet_species";
