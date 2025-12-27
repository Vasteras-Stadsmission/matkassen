/**
 * Parcel warning utilities for tracking household parcel counts
 * and displaying warnings when thresholds are exceeded.
 */

import { db } from "@/app/db/drizzle";
import { globalSettings, foodParcels } from "@/app/db/schema";
import { eq, and, isNull, count } from "drizzle-orm";

const PARCEL_WARNING_THRESHOLD_KEY = "parcel_warning_threshold";

export interface ParcelWarningData {
    shouldWarn: boolean;
    parcelCount: number;
    threshold: number | null;
}

/**
 * Get the current parcel warning threshold.
 * Returns null if not set (warnings disabled).
 */
export async function getParcelWarningThreshold(): Promise<number | null> {
    const [setting] = await db
        .select()
        .from(globalSettings)
        .where(eq(globalSettings.key, PARCEL_WARNING_THRESHOLD_KEY));

    if (!setting?.value) {
        return null;
    }

    const threshold = parseInt(setting.value, 10);
    // Treat invalid (NaN), zero, or negative thresholds as disabled
    // Zero would mean "warn for every household" which is not useful
    return isNaN(threshold) || threshold < 1 ? null : threshold;
}

/**
 * Get the total count of parcels for a household (both past and future, excluding soft-deleted).
 */
export async function getHouseholdParcelCount(householdId: string): Promise<number> {
    const [result] = await db
        .select({ count: count() })
        .from(foodParcels)
        .where(and(eq(foodParcels.household_id, householdId), isNull(foodParcels.deleted_at)));

    return result?.count ?? 0;
}

/**
 * Check if a household should show a parcel warning.
 * Returns an object with warning status and relevant data.
 *
 * Warning shows when parcel count is GREATER THAN threshold (not equal).
 * - Threshold = 10 → Warns at 11 or more parcels
 * - Threshold = 5 → Warns at 6 or more parcels
 */
export async function shouldShowParcelWarning(householdId: string): Promise<ParcelWarningData> {
    const [threshold, parcelCount] = await Promise.all([
        getParcelWarningThreshold(),
        getHouseholdParcelCount(householdId),
    ]);

    // Warning shows when parcel count is GREATER THAN threshold (not equal)
    const shouldWarn = threshold !== null && parcelCount > threshold;

    return {
        shouldWarn,
        parcelCount,
        threshold,
    };
}
