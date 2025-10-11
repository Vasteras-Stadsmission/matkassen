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
 * Additionally, this function automatically creates SMS records for each new parcel:
 * - If parcel is >48 hours away: SMS scheduled for 48 hours before pickup
 * - If parcel is <48 hours away: SMS scheduled with 5-minute grace period
 * - SMS records are created even if the parcel insert is skipped due to conflict
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

    console.log(`📦 insertParcels called with ${parcels.length} parcel(s):`, {
        households: [...new Set(parcels.map(p => p.household_id))],
        locations: [...new Set(parcels.map(p => p.pickup_location_id))],
        pickupTimes: parcels.map(p => p.pickup_date_time_earliest.toISOString()),
    });

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

    // If no parcels were inserted (all were duplicates), return early
    if (insertedParcels.length === 0) {
        console.log(
            `⚠️  No parcels inserted (all ${parcels.length} were duplicates). ` +
                `This means parcels with the same household, location, and time window already exist.`,
        );
        return [];
    }

    console.log(`✅ Inserted ${insertedParcels.length} parcel(s) successfully:`, {
        insertedIds: insertedParcels.map(p => p.id),
        totalAttempted: parcelsWithIds.length,
    });

    // Create SMS records for the successfully inserted parcels
    const insertedIds = new Set(insertedParcels.map(p => p.id));
    const parcelsToQueueSms = parcelsWithIds.filter(p => insertedIds.has(p.id));

    if (parcelsToQueueSms.length > 0) {
        console.log(`📱 Queueing SMS for ${parcelsToQueueSms.length} parcel(s)...`);
        // Import dynamically to avoid circular dependencies
        const { queueSmsForNewParcels } = await import("@/app/utils/sms/parcel-sms");
        await queueSmsForNewParcels(tx, parcelsToQueueSms);
        console.log(`✓ SMS queueing complete for ${parcelsToQueueSms.length} parcel(s)`);
    } else {
        console.log(`⚠️  No SMS queued (no parcels were successfully inserted)`);
    }

    return insertedParcels.map(p => p.id);
}
