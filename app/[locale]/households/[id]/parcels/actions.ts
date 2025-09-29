"use server";

import { db } from "@/app/db/drizzle";
import { foodParcels } from "@/app/db/schema";
import { eq, gt } from "drizzle-orm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { nanoid } from "@/app/db/schema";

interface ParcelUpdateResult {
    success: boolean;
    error?: string;
}

export async function updateHouseholdParcels(
    householdId: string,
    parcelsData: FoodParcels,
): Promise<ParcelUpdateResult> {
    try {
        // Start transaction to ensure all related data is updated atomically
        return await db.transaction(async tx => {
            // Delete existing future food parcels for this household
            const now = new Date();
            await tx
                .delete(foodParcels)
                .where(
                    eq(foodParcels.household_id, householdId) &&
                        gt(foodParcels.pickup_date_time_latest, now),
                );

            // Create new food parcels based on the updated schedule
            if (parcelsData.parcels && parcelsData.parcels.length > 0) {
                // Filter to only future parcels (safety check)
                const futureParcels = parcelsData.parcels
                    .filter(parcel => new Date(parcel.pickupDate) > now)
                    .map(parcel => ({
                        id: nanoid(),
                        household_id: householdId,
                        pickup_location_id: parcelsData.pickupLocationId,
                        pickup_date_time_earliest: parcel.pickupEarliestTime,
                        pickup_date_time_latest: parcel.pickupLatestTime,
                        is_picked_up: false,
                    }));

                // Only insert if there are future parcels
                if (futureParcels.length > 0) {
                    await tx.insert(foodParcels).values(futureParcels);
                }
            }

            return { success: true };
        });
    } catch (error: unknown) {
        console.error("Error updating household parcels:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}
