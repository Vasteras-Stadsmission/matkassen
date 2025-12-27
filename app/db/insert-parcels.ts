import { sql } from "drizzle-orm";
import { foodParcels, nanoid } from "./schema";
import { db } from "./drizzle";

/**
 * Centralized helper for inserting food parcels with proper conflict handling.
 *
 * This function handles the partial unique index constraint on active parcels:
 * - Only one active parcel per (household, location, time) slot
 * - Soft-deleted parcels don't block the slot
 * - Concurrent inserts are idempotent (duplicates are silently skipped)
 *
 * ## Capacity Race Condition Note
 *
 * There's a theoretical TOCTOU (time-of-check-time-of-use) race condition:
 * two concurrent requests could both validate capacity as "1 slot available",
 * then both insert, causing overbooking.
 *
 * **Decision: Accept this risk rather than add advisory locks.**
 *
 * Rationale:
 * - With ~10-15 active users, concurrent bookings for the same location/timeslot
 *   are extremely rare
 * - The partial unique index prevents duplicate parcels (same household can't
 *   double-book)
 * - Advisory locks would add complexity and lock contention for minimal benefit
 * - If overbooking becomes an issue, staff can manually adjust
 *
 * If stronger guarantees are needed in the future, consider:
 * - `pg_advisory_xact_lock(hash(locationId, stockholmDate))` before insert
 * - Or a capacity constraint table with row-level locking
 *
 * SMS reminders are handled by the scheduler via pure JIT:
 * - Scheduler finds parcels within 48h of pickup with no existing SMS
 * - Renders fresh SMS with current data
 * - Sends immediately
 * This ensures phone numbers and pickup times are always accurate.
 *
 * The onConflictDoNothing with WHERE clause properly targets the partial unique index
 * defined in migration 0022_fix-soft-delete-unique-constraint.sql:
 * food_parcels_household_location_time_active_unique WHERE deleted_at IS NULL
 *
 * @param tx - Drizzle transaction object
 * @param parcels - Array of parcel data to insert (without IDs - generated automatically)
 * @returns Array of created parcel IDs (excludes duplicates that were skipped)
 */
export async function insertParcels(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    parcels: Array<{
        household_id: string;
        pickup_location_id: string;
        pickup_date_time_earliest: Date;
        pickup_date_time_latest: Date;
        is_picked_up: boolean;
    }>,
): Promise<string[]> {
    if (parcels.length === 0) return [];

    // Generate IDs upfront so we can track which parcels were actually inserted
    const parcelsWithIds = parcels.map(p => ({
        id: nanoid(12), // Food parcels use 12-character IDs
        ...p,
    }));

    const insertedParcels = await tx
        .insert(foodParcels)
        .values(parcelsWithIds)
        .onConflictDoNothing({
            target: [
                foodParcels.household_id,
                foodParcels.pickup_location_id,
                foodParcels.pickup_date_time_earliest,
                foodParcels.pickup_date_time_latest,
            ],
            where: sql`deleted_at IS NULL`, // Targets partial unique index
        })
        .returning({ id: foodParcels.id });

    return insertedParcels.map(p => p.id);
}
