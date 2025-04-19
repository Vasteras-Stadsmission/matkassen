-- The pet_species_types table is already created in the earlier migrations
-- Adding default data for lookup tables using INSERT ... ON CONFLICT DO NOTHING

-- Function to generate short random IDs similar to nanoid
CREATE OR REPLACE FUNCTION generate_short_id(length integer DEFAULT 8)
RETURNS text AS $$
DECLARE
    chars text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
    result text := '';
    i integer := 0;
BEGIN
    FOR i IN 1..length LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Add unique constraints to tables if they don't exist
DO $$
BEGIN
    -- Add unique constraint to dietary_restrictions if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'dietary_restrictions_name_key'
    ) THEN
        ALTER TABLE dietary_restrictions ADD CONSTRAINT dietary_restrictions_name_key UNIQUE (name);
    END IF;

    -- Add unique constraint to additional_needs if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'additional_needs_need_key'
    ) THEN
        ALTER TABLE additional_needs ADD CONSTRAINT additional_needs_need_key UNIQUE (need);
    END IF;

    -- Add unique constraint to pickup_locations if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'pickup_locations_name_key'
    ) THEN
        ALTER TABLE pickup_locations ADD CONSTRAINT pickup_locations_name_key UNIQUE (name);
    END IF;
END
$$;

-- Dietary restrictions default data
INSERT INTO dietary_restrictions (id, name)
VALUES
    (generate_short_id(), 'Gluten'),
    (generate_short_id(), 'Laktos'),
    (generate_short_id(), 'Nötter'),
    (generate_short_id(), 'Ägg'),
    (generate_short_id(), 'Fisk'),
    (generate_short_id(), 'Vegetarian'),
    (generate_short_id(), 'Vegan'),
    (generate_short_id(), 'Fläskkött')
ON CONFLICT (name) DO NOTHING;

-- Pet species default data
INSERT INTO pet_species_types (id, name)
VALUES
    (generate_short_id(), 'Hund'),
    (generate_short_id(), 'Katt'),
    (generate_short_id(), 'Kanin'),
    (generate_short_id(), 'Fågel'),
    (generate_short_id(), 'Fisk'),
    (generate_short_id(), 'Hamster')
ON CONFLICT (name) DO NOTHING;

-- Additional needs default data
INSERT INTO additional_needs (id, need)
VALUES
    (generate_short_id(), 'Blöjor'),
    (generate_short_id(), 'Tamponger/bindor'),
    (generate_short_id(), 'Kattmat'),
    (generate_short_id(), 'Hundmat'),
    (generate_short_id(), 'Rengöringsmedel'),
    (generate_short_id(), 'Tvål'),
    (generate_short_id(), 'Tandkräm'),
    (generate_short_id(), 'Toalettpapper')
ON CONFLICT (need) DO NOTHING;

-- Pickup location default data
INSERT INTO pickup_locations (id, name, street_address, postal_code)
VALUES
    (generate_short_id(), 'Lifecenter Church Västerås', 'Brandthovdagatan 1', '72135')
ON CONFLICT (name) DO NOTHING;
