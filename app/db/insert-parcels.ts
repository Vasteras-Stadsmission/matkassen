import { sql, eq } from "drizzle-orm";
import { foodParcels, nanoid, households } from "./schema";
import { db } from "./drizzle";
import { createSmsRecord } from "@/app/utils/sms/sms-service";
import { formatPickupSms } from "@/app/utils/sms/templates";
import { generateUrl } from "@/app/config/branding";
import type { SupportedLocale } from "@/app/utils/locale-detection";
import { logger, logError } from "@/app/utils/logger";

/**
 * Centralized helper for inserting food parcels with proper conflict handling.
 *
 * This function handles the partial unique index constraint on active parcels:
 * - Only one active parcel per (household, location, time) slot
 * - Soft-deleted parcels don't block the slot
 * - Concurrent inserts are idempotent (duplicates are silently skipped)
 *
 * SMS records ARE created here for immediate dashboard visibility. The SMS content
 * will be re-rendered at send time (JIT) to ensure phone numbers and pickup times
 * are fresh. This combines immediate feedback with data accuracy.
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

    // If no parcels were inserted (all were duplicates), return early
    if (insertedParcels.length === 0) {
        return [];
    }

    // Queue SMS for newly inserted parcels (for immediate dashboard visibility)
    // The SMS text will be re-rendered at send time (JIT) for fresh data
    const insertedIds = new Set(insertedParcels.map(p => p.id));
    const parcelsToQueue = parcelsWithIds.filter(p => insertedIds.has(p.id));

    for (const parcel of parcelsToQueue) {
        try {
            // Fetch household data for SMS
            const [household] = await tx
                .select({
                    phoneNumber: households.phone_number,
                    locale: households.locale,
                })
                .from(households)
                .where(eq(households.id, parcel.household_id))
                .limit(1);

            if (!household) continue;

            const publicUrl = generateUrl(`/p/${parcel.id}`);
            const smsText = formatPickupSms(
                { pickupDate: parcel.pickup_date_time_earliest, publicUrl },
                household.locale as SupportedLocale,
            );

            // Schedule SMS to be sent 48h before pickup
            // If pickup is sooner than 48h, SMS will be sent on next scheduler run
            const scheduledSendTime = new Date(
                parcel.pickup_date_time_earliest.getTime() - 48 * 60 * 60 * 1000,
            );

            await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: parcel.household_id,
                toE164: household.phoneNumber,
                text: smsText,
                nextAttemptAt: scheduledSendTime,
            });
        } catch (error) {
            // Non-fatal: log but continue with other parcels
            logError("Failed to queue SMS for parcel", error, { parcelId: parcel.id });
        }
    }

    logger.info(
        { parcelCount: insertedParcels.length, parcelIds: insertedParcels.map(p => p.id) },
        "Parcels inserted with SMS queued",
    );

    return insertedParcels.map(p => p.id);
}
