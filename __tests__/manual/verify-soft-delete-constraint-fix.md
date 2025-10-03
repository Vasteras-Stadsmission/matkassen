# Manual Verification: Soft-Delete Unique Constraint Fix (Migration 0022)

## Purpose

Verify that Migration 0022 correctly allows recreating parcels after soft-deletion by replacing the standard unique constraint with a partial unique index.

## Bug Being Fixed

**Before Fix:** The unique constraint `food_parcels_household_location_time_unique` applied to ALL rows, including soft-deleted ones. This prevented recreating a parcel after deletion because the deleted row still "occupied" that slot.

**After Fix:** Partial unique index only enforces uniqueness for active parcels (WHERE deleted_at IS NULL), allowing recreation while still preventing duplicate active parcels.

## Prerequisites

- Local development environment running (`pnpm dev`)
- Migration 0022 applied (`pnpm run db:migrate`)
- Access to PostgreSQL database

## Verification Steps

### Step 1: Verify the Index Exists

```sql
-- Connect to your development database
SELECT
    i.relname as index_name,
    pg_get_indexdef(i.oid) as index_definition
FROM pg_class i
JOIN pg_index ix ON i.oid = ix.indexrelid
WHERE i.relname = 'food_parcels_household_location_time_active_unique';
```

**Expected Output:**

```
index_name: food_parcels_household_location_time_active_unique
index_definition: CREATE UNIQUE INDEX food_parcels_household_location_time_active_unique
                  ON public.food_parcels USING btree (household_id, pickup_location_id,
                  pickup_date_time_earliest, pickup_date_time_latest)
                  WHERE (deleted_at IS NULL)
```

### Step 2: Verify Old Constraint is Removed

```sql
SELECT constraint_name
FROM information_schema.table_constraints
WHERE table_name = 'food_parcels'
  AND constraint_name = 'food_parcels_household_location_time_unique';
```

**Expected Output:** Empty (0 rows) - the old constraint should be gone.

### Step 3: Test Recreation After Soft-Delete (UI Method)

1. **Create a test household** (if not exists):

    - Navigate to Households page in admin UI
    - Create household: "Test User", phone: "+46701234567", postal code: "12345"

2. **Schedule a parcel**:

    - Go to Schedule page
    - Click on a future date
    - Select the test household
    - Choose a location and time window
    - Save parcel

3. **Soft-delete the parcel**:

    - Click on the created parcel
    - Click "Delete parcel" button
    - Confirm deletion
    - Verify parcel disappears from schedule

4. **Recreate the SAME parcel**:

    - Go back to Schedule page
    - Click on the SAME date
    - Select the SAME household
    - Choose the SAME location and time window
    - Save parcel
    - **✅ This should succeed** (before fix: would fail silently)

5. **Verify in database**:

    ```sql
    SELECT
        id,
        household_id,
        pickup_location_id,
        pickup_date_time_earliest,
        pickup_date_time_latest,
        deleted_at,
        deleted_by_user_id
    FROM food_parcels
    WHERE household_id = '<test-household-id>'
    ORDER BY created_at DESC
    LIMIT 5;
    ```

    **Expected:** Two parcels with same household/location/time:

    - One with `deleted_at IS NOT NULL` (the deleted one)
    - One with `deleted_at IS NULL` (the recreated active one)

### Step 4: Test Duplicate Active Parcel Prevention (Database Method)

```sql
-- Create a test household (if needed)
INSERT INTO households (id, first_name, last_name, phone_number, postal_code, locale)
VALUES ('testH001', 'Test', 'Household', '+46701234567', '12345', 'sv');

-- Create first active parcel
INSERT INTO food_parcels (
    id,
    household_id,
    pickup_location_id,
    pickup_date_time_earliest,
    pickup_date_time_latest,
    is_picked_up
)
VALUES (
    'testP001',
    'testH001',
    'test-location',
    '2025-10-15 14:00:00+00',
    '2025-10-15 16:00:00+00',
    false
);

-- Try to create a SECOND active parcel with SAME household/location/time
-- This should FAIL with unique index violation
INSERT INTO food_parcels (
    id,
    household_id,
    pickup_location_id,
    pickup_date_time_earliest,
    pickup_date_time_latest,
    is_picked_up
)
VALUES (
    'testP002',
    'testH001',
    'test-location',
    '2025-10-15 14:00:00+00',
    '2025-10-15 16:00:00+00',
    false
);
```

**Expected Error:**

```
ERROR: duplicate key value violates unique constraint
       "food_parcels_household_location_time_active_unique"
```

### Step 5: Test Recreation After Soft-Delete (Database Method)

```sql
-- Soft-delete the parcel from Step 4
UPDATE food_parcels
SET deleted_at = NOW(),
    deleted_by_user_id = 'test-admin'
WHERE id = 'testP001';

-- Now try to create a NEW parcel with SAME household/location/time
-- This should SUCCEED because the partial index only applies to active parcels
INSERT INTO food_parcels (
    id,
    household_id,
    pickup_location_id,
    pickup_date_time_earliest,
    pickup_date_time_latest,
    is_picked_up
)
VALUES (
    'testP003',
    'testH001',
    'test-location',
    '2025-10-15 14:00:00+00',
    '2025-10-15 16:00:00+00',
    false
);
```

**Expected:** Success (INSERT 0 1)

**Verify:**

```sql
SELECT id, deleted_at, deleted_by_user_id
FROM food_parcels
WHERE household_id = 'testH001'
  AND pickup_location_id = 'test-location'
  AND pickup_date_time_earliest = '2025-10-15 14:00:00+00'
  AND pickup_date_time_latest = '2025-10-15 16:00:00+00';
```

**Expected Output:**

```
id         | deleted_at              | deleted_by_user_id
-----------+-------------------------+-------------------
testP001   | 2025-10-03 10:00:00+00 | test-admin
testP003   | NULL                    | NULL
```

### Step 6: Test onConflictDoNothing Pattern

This tests the idempotent insert pattern used in `updateHouseholdParcels()`.

```sql
-- Clean up from previous tests
DELETE FROM food_parcels WHERE household_id = 'testH001';

-- First insert (should succeed)
INSERT INTO food_parcels (
    id, household_id, pickup_location_id,
    pickup_date_time_earliest, pickup_date_time_latest, is_picked_up
)
VALUES (
    'testP004', 'testH001', 'test-location',
    '2025-10-16 14:00:00+00', '2025-10-16 16:00:00+00', false
)
ON CONFLICT (household_id, pickup_location_id, pickup_date_time_earliest, pickup_date_time_latest)
WHERE deleted_at IS NULL
DO NOTHING
RETURNING id;
```

**Expected:** Returns `testP004`

```sql
-- Second insert with different ID but same values (should do nothing)
INSERT INTO food_parcels (
    id, household_id, pickup_location_id,
    pickup_date_time_earliest, pickup_date_time_latest, is_picked_up
)
VALUES (
    'testP005', 'testH001', 'test-location',
    '2025-10-16 14:00:00+00', '2025-10-16 16:00:00+00', false
)
ON CONFLICT (household_id, pickup_location_id, pickup_date_time_earliest, pickup_date_time_latest)
WHERE deleted_at IS NULL
DO NOTHING
RETURNING id;
```

**Expected:** Returns nothing (0 rows) - conflict detected, nothing inserted

**Note:** PostgreSQL's ON CONFLICT clause for partial unique indexes requires PostgreSQL 15+. If using an older version, you may need to adjust the syntax or verify behavior differently.

## Cleanup

```sql
-- Remove test data
DELETE FROM food_parcels WHERE household_id = 'testH001';
DELETE FROM households WHERE id = 'testH001';
```

## Success Criteria

- ✅ Partial unique index exists with correct definition
- ✅ Old unique constraint is removed
- ✅ Can create active parcel
- ✅ Cannot create duplicate active parcel (uniqueness still enforced)
- ✅ Can soft-delete parcel
- ✅ Can recreate parcel with same values after soft-delete
- ✅ Both parcels (deleted + active) exist in database
- ✅ Only active parcel appears in queries with `deleted_at IS NULL` filter
- ✅ onConflictDoNothing pattern works correctly

## Troubleshooting

### Issue: Old constraint still exists

**Symptom:** Query in Step 2 returns a row

**Fix:**

```sql
-- Manually drop the old constraint
ALTER TABLE food_parcels DROP CONSTRAINT food_parcels_household_location_time_unique;
```

Then run the migration again:

```bash
pnpm run db:migrate
```

### Issue: Recreation fails with constraint violation

**Symptom:** Step 5 fails with unique constraint error

**Diagnosis:**

```sql
-- Check if the old constraint exists
SELECT constraint_name, constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'food_parcels';
```

**Fix:** Drop old constraint and recreate partial index (see migration file).

### Issue: onConflictDoNothing doesn't work

**Symptom:** PostgreSQL error about ON CONFLICT with partial index

**Cause:** PostgreSQL version < 15 doesn't fully support ON CONFLICT with partial unique indexes

**Workaround:** The application code uses Drizzle ORM's `onConflictDoNothing()` which should handle this correctly. Verify Drizzle version is up to date.

## Related Files

- Migration: `migrations/0022_fix-soft-delete-unique-constraint.sql`
- Schema: `app/db/schema.ts` (comment explaining partial index)
- Application code: `app/[locale]/households/[id]/parcels/actions.ts` (updateHouseholdParcels)
- Documentation: `docs/soft-delete-feature.md`
