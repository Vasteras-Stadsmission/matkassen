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
 * The onConflictDoNothing with WHERE clause properly targets the partial unique index
 * defined in migration 0022_fix-soft-delete-unique-constraint.sql:
 * food_parcels_household_location_time_active_unique WHERE deleted_at IS NULL
 *
 * @param tx - Drizzle transaction object
 * @param parcels - Array of parcel data to insert (without IDs - generated automatically)
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
): Promise<void> {
    if (parcels.length === 0) return;

    await tx
        .insert(foodParcels)
        .values(
            parcels.map(p => ({
                id: nanoid(12), // Food parcels use 12-character IDs
                ...p,
            })),
        )
        .onConflictDoNothing({
            target: [
                foodParcels.household_id,
                foodParcels.pickup_location_id,
                foodParcels.pickup_date_time_earliest,
                foodParcels.pickup_date_time_latest,
            ],
            where: sql`deleted_at IS NULL`, // Targets partial unique index
        });
}
