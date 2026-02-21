-- Normalize dietary restriction colors to severity levels.
-- After this migration the column stores only "required" or "preference".
UPDATE dietary_restrictions
SET color = 'preference'
WHERE color IS NULL
   OR color NOT IN ('required', 'preference');