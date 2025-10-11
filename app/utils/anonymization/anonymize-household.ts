/**
 * Hoimport { db } from "@/app/db/drizzle";
import { households, householdComments, outgoingSms, foodParcels } from "@/app/db/schema";
import { eq, and, isNull, sql, desc } from "drizzle-orm";hold anonymization utilities
 *
 * Implements GDPR-compliant data anonymization:
 * - Replaces personal identifiers with placeholders
 * - Deletes comments and SMS records
 * - Preserves statistical data (parcels, postal code, locale)
 */

import { db } from "@/app/db/drizzle";
import { households, householdComments, outgoingSms, foodParcels } from "@/app/db/schema";
import { eq, and, gte, isNull, sql, desc } from "drizzle-orm";

/**
 * Result of removal operation
 */
export interface RemovalResult {
    method: "deleted" | "anonymized";
    householdId: string;
}

/**
 * Check if household can be removed (no upcoming non-deleted parcels)
 */
export async function canRemoveHousehold(householdId: string): Promise<{
    allowed: boolean;
    reason?: string;
    upcomingParcelCount?: number;
}> {
    // Use date-only comparison to match UI behavior (see HouseholdDetailsPage.isDateInPast)
    // Same-day parcels are considered "upcoming" throughout the entire day
    // This prevents deletion of households with parcels scheduled for today,
    // even if the pickup window has already passed
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today (00:00:00)

    // Count upcoming parcels that are NOT soft-deleted
    const upcomingParcels = await db
        .select({ id: foodParcels.id })
        .from(foodParcels)
        .where(
            and(
                eq(foodParcels.household_id, householdId),
                isNull(foodParcels.deleted_at), // Not soft-deleted
                gte(foodParcels.pickup_date_time_earliest, today), // Today or future (date-only comparison)
            ),
        );

    if (upcomingParcels.length > 0) {
        return {
            allowed: false,
            reason: "upcoming_parcels",
            upcomingParcelCount: upcomingParcels.length,
        };
    }

    return { allowed: true };
}

/**
 * Get next anonymization sequence number for phone placeholder
 */
async function getNextAnonymizationSequence(): Promise<number> {
    // Find highest existing anonymization sequence
    const result = await db
        .select({ phone: households.phone_number })
        .from(households)
        .where(sql`${households.phone_number} LIKE '000000%'`)
        .orderBy(desc(households.phone_number))
        .limit(1);

    if (result.length === 0) {
        return 1; // First anonymization
    }

    // Extract sequence from phone number (e.g., "0000000042" -> 42)
    const lastSequence = parseInt(result[0].phone.replace("000000", ""), 10);
    return isNaN(lastSequence) ? 1 : lastSequence + 1;
}

/**
 * Anonymize household data (replace PII with placeholders, delete comments/SMS)
 */
async function anonymizeHousehold(
    householdId: string,
    performedBy: string,
): Promise<RemovalResult> {
    const sequence = await getNextAnonymizationSequence();
    const phoneNumber = `000000${sequence.toString().padStart(4, "0")}`; // e.g., "0000000001"

    await db.transaction(async tx => {
        // 1. Anonymize household record
        await tx
            .update(households)
            .set({
                first_name: "Anonymized",
                last_name: "User",
                phone_number: phoneNumber,
                anonymized_at: new Date(),
                anonymized_by: performedBy,
            })
            .where(eq(households.id, householdId));

        // 2. Delete comments (hard delete)
        await tx.delete(householdComments).where(eq(householdComments.household_id, householdId));

        // 3. Delete SMS records (hard delete)
        await tx.delete(outgoingSms).where(eq(outgoingSms.household_id, householdId));
    });

    console.log(`✅ Household ${householdId} anonymized by ${performedBy} (phone: ${phoneNumber})`);

    return { method: "anonymized", householdId };
}

/**
 * Hard delete household (cascade deletes all related records)
 */
async function hardDeleteHousehold(householdId: string): Promise<RemovalResult> {
    await db.delete(households).where(eq(households.id, householdId));

    console.log(`🗑️ Household ${householdId} hard deleted (no service history)`);

    return { method: "deleted", householdId };
}

/**
 * Remove household (smart decision: delete if no parcels, anonymize if has parcels)
 *
 * Logic:
 * 1. Check for upcoming parcels (block if found)
 * 2. Check if household has ANY parcels
 *    - No parcels → Hard delete (cleanup)
 *    - Has parcels → Anonymize (preserve statistics)
 */
export async function removeHousehold(
    householdId: string,
    performedBy: string,
): Promise<RemovalResult> {
    // 1. Check if removal is allowed (no upcoming parcels)
    const canRemove = await canRemoveHousehold(householdId);
    if (!canRemove.allowed) {
        throw new Error(
            `Cannot remove household: ${canRemove.upcomingParcelCount} upcoming parcel(s) scheduled`,
        );
    }

    // 2. Check if household has ANY parcels (regardless of pickup status)
    const parcelCount = await db
        .select({ id: foodParcels.id })
        .from(foodParcels)
        .where(eq(foodParcels.household_id, householdId))
        .limit(1);

    if (parcelCount.length === 0) {
        // No parcels at all → Hard delete
        return await hardDeleteHousehold(householdId);
    }

    // Has parcels → Anonymize to preserve statistics
    return await anonymizeHousehold(householdId, performedBy);
}

/**
 * Find households eligible for automatic anonymization (12+ months since last parcel)
 */
export async function findHouseholdsForAutomaticAnonymization(
    inactiveMonths: number = 12,
): Promise<string[]> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - inactiveMonths);

    // Find households that:
    // 1. Are not already anonymized
    // 2. Have no parcels in the last X months
    // 3. Have no upcoming parcels
    const inactiveHouseholds = await db
        .select({
            householdId: households.id,
            lastParcelDate: sql<Date>`MAX(${foodParcels.pickup_date_time_earliest})`,
        })
        .from(households)
        .leftJoin(foodParcels, eq(foodParcels.household_id, households.id))
        .where(isNull(households.anonymized_at)) // Not already anonymized
        .groupBy(households.id)
        .having(
            sql`MAX(${foodParcels.pickup_date_time_earliest}) < ${cutoffDate} OR MAX(${foodParcels.pickup_date_time_earliest}) IS NULL`,
        );

    // Filter out those with upcoming parcels (safety check)
    const eligibleHouseholds: string[] = [];
    for (const household of inactiveHouseholds) {
        const canRemove = await canRemoveHousehold(household.householdId);
        if (canRemove.allowed) {
            eligibleHouseholds.push(household.householdId);
        }
    }

    return eligibleHouseholds;
}

/**
 * Automatically anonymize inactive households (batch operation)
 */
export async function anonymizeInactiveHouseholds(
    inactiveMonths: number = 12,
): Promise<{ anonymized: number; errors: string[] }> {
    const eligibleHouseholds = await findHouseholdsForAutomaticAnonymization(inactiveMonths);

    let anonymized = 0;
    const errors: string[] = [];

    for (const householdId of eligibleHouseholds) {
        try {
            await removeHousehold(householdId, "system"); // performedBy = "system" for automatic
            anonymized++;
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown error";
            errors.push(`${householdId}: ${message}`);
            console.error(`❌ Failed to anonymize household ${householdId}:`, error);
        }
    }

    console.log(
        `[Anonymization] Processed ${eligibleHouseholds.length} households: ${anonymized} anonymized, ${errors.length} errors`,
    );

    return { anonymized, errors };
}
