"use server";

import { db } from "@/app/db/drizzle";
import { foodParcels } from "@/app/db/schema";
import { eq, gt, and } from "drizzle-orm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { nanoid } from "@/app/db/schema";
import { protectedHouseholdAction } from "@/app/utils/auth/protected-action";
import { ParcelValidationError } from "@/app/utils/errors/validation-errors";
import {
    success,
    failure,
    validationFailure,
    type ActionResult,
} from "@/app/utils/auth/action-result";

export const updateHouseholdParcels = protectedHouseholdAction(
    async (session, household, parcelsData: FoodParcels): Promise<ActionResult<void>> => {
        try {
            // Auth and household verification already done by protectedHouseholdAction
            const locationId = parcelsData.pickupLocationId;

            // Start transaction to ensure all related data is updated atomically
            await db.transaction(async tx => {
                const now = new Date();

                // Create new food parcels based on the updated schedule
                if (parcelsData.parcels && parcelsData.parcels.length > 0) {
                    // Validate all parcel assignments before creating any
                    const { validateParcelAssignments } = await import(
                        "@/app/[locale]/schedule/actions"
                    );

                    const parcelsToValidate = parcelsData.parcels
                        .filter(parcel => parcel.pickupLatestTime > now) // Only parcels with future pickup windows
                        .map(parcel => ({
                            householdId: household.id,
                            locationId: parcelsData.pickupLocationId,
                            pickupDate: new Date(parcel.pickupDate),
                            pickupStartTime: parcel.pickupEarliestTime,
                            pickupEndTime: parcel.pickupLatestTime,
                        }));

                    if (parcelsToValidate.length > 0) {
                        const validationResult = await validateParcelAssignments(parcelsToValidate);

                        if (!validationResult.success) {
                            // Throw to trigger transaction rollback
                            throw new ParcelValidationError(
                                "Parcel validation failed",
                                validationResult.errors || [],
                            );
                        }
                    }

                    // Filter to only future parcels
                    const futureParcels = parcelsData.parcels
                        .filter(parcel => parcel.pickupLatestTime > now)
                        .map(parcel => ({
                            id: nanoid(),
                            household_id: household.id,
                            pickup_location_id: parcelsData.pickupLocationId,
                            pickup_date_time_earliest: parcel.pickupEarliestTime,
                            pickup_date_time_latest: parcel.pickupLatestTime,
                            is_picked_up: false,
                        }));

                    // Use upsert pattern to ensure idempotency during concurrent operations
                    // The unique constraint on (household_id, pickup_location_id, pickup_date_time_earliest, pickup_date_time_latest)
                    // guarantees that we won't create duplicates even if multiple requests run concurrently
                    // Including location ensures that location changes are properly handled
                    if (futureParcels.length > 0) {
                        await tx
                            .insert(foodParcels)
                            .values(futureParcels)
                            .onConflictDoNothing({
                                target: [
                                    foodParcels.household_id,
                                    foodParcels.pickup_location_id,
                                    foodParcels.pickup_date_time_earliest,
                                    foodParcels.pickup_date_time_latest,
                                ],
                            });
                    }
                }

                // Delete parcels that are no longer in the desired schedule
                // This handles cases where the user removed parcels or changed locations
                // We do this AFTER the insert to avoid a window where no parcels exist
                // Key includes location to properly handle location changes
                const desiredParcelKeys = new Set(
                    parcelsData.parcels
                        .filter(p => p.pickupLatestTime > now)
                        .map(
                            p =>
                                `${parcelsData.pickupLocationId}-${p.pickupEarliestTime.toISOString()}-${p.pickupLatestTime.toISOString()}`,
                        ),
                );

                // Get all existing future parcels for this household
                const existingFutureParcels = await tx
                    .select({
                        id: foodParcels.id,
                        locationId: foodParcels.pickup_location_id,
                        earliest: foodParcels.pickup_date_time_earliest,
                        latest: foodParcels.pickup_date_time_latest,
                    })
                    .from(foodParcels)
                    .where(
                        and(
                            eq(foodParcels.household_id, household.id),
                            gt(foodParcels.pickup_date_time_latest, now),
                        ),
                    );

                // Delete parcels that are not in the desired schedule
                const parcelsToDelete = existingFutureParcels.filter(
                    p =>
                        !desiredParcelKeys.has(
                            `${p.locationId}-${p.earliest.toISOString()}-${p.latest.toISOString()}`,
                        ),
                );

                if (parcelsToDelete.length > 0) {
                    for (const parcel of parcelsToDelete) {
                        await tx.delete(foodParcels).where(eq(foodParcels.id, parcel.id));
                    }
                }
            });

            /**
             * EVENTUAL CONSISTENCY: Recompute outside-hours count after transaction commits.
             *
             * This is intentionally executed AFTER the transaction to avoid holding database locks
             * during the potentially expensive recomputation. The trade-off is that there's a brief
             * window where the count might be stale if another request modifies parcels between
             * transaction commit and this recomputation.
             *
             * This is acceptable because:
             * 1. The outside-hours count is a UI convenience feature, not critical business logic
             * 2. The count will eventually converge to the correct value
             * 3. Keeping it inside the transaction would increase lock contention and reduce throughput
             * 4. Any stale count will be corrected by the next schedule operation
             *
             * If stronger consistency is required, consider moving this to a background job queue.
             */
            try {
                const { recomputeOutsideHoursCount } = await import(
                    "@/app/[locale]/schedule/actions"
                );
                await recomputeOutsideHoursCount(locationId);
            } catch (e) {
                console.error("Failed to recompute outside-hours count after parcel update:", e);
                // Non-fatal: The count will be corrected by the next schedule operation
            }

            return success(undefined);
        } catch (error: unknown) {
            // Check if this is a validation error from within the transaction
            if (error instanceof ParcelValidationError) {
                return validationFailure(error.message, error.validationErrors);
            }

            console.error("Error updating household parcels:", error);
            return failure({
                code: "INTERNAL_ERROR",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    },
);
