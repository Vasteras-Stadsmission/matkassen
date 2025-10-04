import { nanoid } from "@/app/db/schema";
import { getStockholmDateKey } from "@/app/utils/date-utils";

export interface ParcelOperationInput {
    id: string;
    locationId: string;
    earliest: Date;
    latest: Date;
}

export interface DesiredParcelInput {
    id?: string;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
}

export interface ParcelOperationsResult {
    toCreate: Array<{
        id: string;
        household_id: string;
        pickup_location_id: string;
        pickup_date_time_earliest: Date;
        pickup_date_time_latest: Date;
        is_picked_up: boolean;
    }>;
    toUpdate: Array<{
        id: string;
        pickup_date_time_earliest: Date;
        pickup_date_time_latest: Date;
    }>;
    toDelete: string[];
}

/**
 * Calculate parcel operations using same-day matching logic (Option B).
 * This enables surgical updates: only time changes on the same day update the existing parcel,
 * preserving parcel IDs and preventing SMS cancellations.
 *
 * Matching logic:
 * - Same location + same date (ignoring time) = UPDATE existing parcel with new times
 * - Different location or different date = DELETE old + CREATE new
 */
export function calculateParcelOperations(
    existing: ParcelOperationInput[],
    desired: DesiredParcelInput[],
    newLocationId: string,
    householdId: string,
): ParcelOperationsResult {
    const toCreate: ParcelOperationsResult["toCreate"] = [];
    const toUpdate: ParcelOperationsResult["toUpdate"] = [];
    const toDelete: ParcelOperationsResult["toDelete"] = [];

    // Build map of existing parcels: location-date -> parcel
    // Uses Stockholm timezone for date keys to ensure correct same-day matching
    // across midnight boundaries and DST transitions
    const existingMap = new Map<string, ParcelOperationInput>();
    for (const parcel of existing) {
        const key = `${parcel.locationId}-${getStockholmDateKey(parcel.earliest)}`;
        existingMap.set(key, parcel);
    }

    // Track which existing parcels we've matched
    const matchedExistingIds = new Set<string>();

    // Process desired parcels
    for (const desiredParcel of desired) {
        const desiredDateKey = getStockholmDateKey(desiredParcel.pickupEarliestTime);
        const key = `${newLocationId}-${desiredDateKey}`;

        const existingParcel = existingMap.get(key);

        if (existingParcel) {
            // Same location + same date = UPDATE times if changed
            matchedExistingIds.add(existingParcel.id);

            // Check if times actually changed
            const timesChanged =
                existingParcel.earliest.getTime() !== desiredParcel.pickupEarliestTime.getTime() ||
                existingParcel.latest.getTime() !== desiredParcel.pickupLatestTime.getTime();

            if (timesChanged) {
                toUpdate.push({
                    id: existingParcel.id,
                    pickup_date_time_earliest: desiredParcel.pickupEarliestTime,
                    pickup_date_time_latest: desiredParcel.pickupLatestTime,
                });
            }
            // If times unchanged, do nothing (parcel already correct)
        } else {
            // No match = CREATE new parcel
            toCreate.push({
                id: nanoid(12), // Food parcels use 12-character IDs
                household_id: householdId,
                pickup_location_id: newLocationId,
                pickup_date_time_earliest: desiredParcel.pickupEarliestTime,
                pickup_date_time_latest: desiredParcel.pickupLatestTime,
                is_picked_up: false,
            });
        }
    }

    // Any unmatched existing parcels should be deleted
    for (const parcel of existing) {
        if (!matchedExistingIds.has(parcel.id)) {
            toDelete.push(parcel.id);
        }
    }

    return { toCreate, toUpdate, toDelete };
}
