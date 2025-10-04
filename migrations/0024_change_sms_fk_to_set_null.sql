-- Custom SQL migration file, put your code below! --

-- Change outgoing_sms.parcel_id foreign key from CASCADE to SET NULL
-- This provides defensive data preservation: if a parcel is ever hard-deleted (shouldn't happen),
-- the SMS records will be preserved with parcel_id set to NULL instead of being CASCADE deleted.

-- Drop the existing constraint
ALTER TABLE "outgoing_sms" DROP CONSTRAINT IF EXISTS "outgoing_sms_parcel_id_food_parcels_id_fk";

-- Add the new constraint with SET NULL on delete
ALTER TABLE "outgoing_sms"
ADD CONSTRAINT "outgoing_sms_parcel_id_food_parcels_id_fk"
FOREIGN KEY ("parcel_id")
REFERENCES "food_parcels"("id")
ON DELETE SET NULL
ON UPDATE NO ACTION;
