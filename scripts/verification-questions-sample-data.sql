-- Verification Questions - Sample Test Data
-- Use this SQL to add example verification questions to your development database

-- IMPORTANT: Replace 'YOUR_LOCATION_ID' with an actual pickup location ID from your database
-- You can find location IDs by running: SELECT id, name FROM pickup_locations;

-- Example 1: Required verification about postal code
INSERT INTO pickup_location_verification_questions (
  id,
  pickup_location_id,
  question_text_sv,
  question_text_en,
  help_text_sv,
  help_text_en,
  is_required,
  display_order,
  is_active
) VALUES (
  'vq_postal',
  'YOUR_LOCATION_ID', -- Replace this!
  'Jag har verifierat att hushållet bor i rätt postnummerområde',
  'I have verified that the household lives in the correct postal code area',
  'Kontrollera att postnumret stämmer med utlämningsställets område',
  'Check that the postal code matches the handout location area',
  true, -- Required
  0,    -- First question
  true  -- Active
);

-- Example 2: Required verification about pickup times
INSERT INTO pickup_location_verification_questions (
  id,
  pickup_location_id,
  question_text_sv,
  question_text_en,
  help_text_sv,
  help_text_en,
  is_required,
  display_order,
  is_active
) VALUES (
  'vq_pickup_times',
  'YOUR_LOCATION_ID', -- Replace this!
  'Jag har informerat hushållet om hämtningstider och rutiner',
  'I have informed the household about pickup times and procedures',
  NULL, -- No help text
  NULL,
  true, -- Required
  1,    -- Second question
  true  -- Active
);

-- Example 3: Optional verification about consent
INSERT INTO pickup_location_verification_questions (
  id,
  pickup_location_id,
  question_text_sv,
  question_text_en,
  help_text_sv,
  help_text_en,
  is_required,
  display_order,
  is_active
) VALUES (
  'vq_consent',
  'YOUR_LOCATION_ID', -- Replace this!
  'Hushållet har samtyckt till databehandling enligt GDPR',
  'The household has consented to data processing according to GDPR',
  'Detta är valfritt men rekommenderas',
  'This is optional but recommended',
  false, -- Optional
  2,     -- Third question
  true   -- Active
);

-- Example 4: Required verification about identification
INSERT INTO pickup_location_verification_questions (
  id,
  pickup_location_id,
  question_text_sv,
  question_text_en,
  help_text_sv,
  help_text_en,
  is_required,
  display_order,
  is_active
) VALUES (
  'vq_identification',
  'YOUR_LOCATION_ID', -- Replace this!
  'Jag har verifierat hushållets identitet',
  'I have verified the household identity',
  'Kontrollera personnummer eller annan legitimation',
  'Check personal ID number or other identification',
  true, -- Required
  3,    -- Fourth question
  true  -- Active
);

-- Verify the data was inserted
SELECT
  id,
  LEFT(question_text_sv, 50) as question_sv,
  LEFT(question_text_en, 50) as question_en,
  is_required,
  display_order,
  is_active
FROM pickup_location_verification_questions
WHERE pickup_location_id = 'YOUR_LOCATION_ID' -- Replace this!
ORDER BY display_order;

-- To deactivate a question (soft delete):
-- UPDATE pickup_location_verification_questions
-- SET is_active = false, updated_at = NOW()
-- WHERE id = 'vq_consent';

-- To reactivate a question:
-- UPDATE pickup_location_verification_questions
-- SET is_active = true, updated_at = NOW()
-- WHERE id = 'vq_consent';

-- To change display order:
-- UPDATE pickup_location_verification_questions
-- SET display_order = 0, updated_at = NOW()
-- WHERE id = 'vq_identification';
