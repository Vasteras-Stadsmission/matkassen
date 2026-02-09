"use server";

import { db } from "@/app/db/drizzle";
import { foodParcels } from "@/app/db/schema";
import { eq, gt, and } from "drizzle-orm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { protectedAgreementHouseholdAction } from "@/app/utils/auth/protected-action";
import { ParcelValidationError } from "@/app/utils/errors/validation-errors";
import {
    success,
    failure,
    validationFailure,
    type ActionResult,
} from "@/app/utils/auth/action-result";
import { notDeleted } from "@/app/db/query-helpers";
import { logError } from "@/app/utils/logger";

export const updateHouseholdParcels = protectedAgreementHouseholdAction(
    async (session, household, parcelsData: FoodParcels): Promise<ActionResult<void>> => {
        try {
            // Auth and household verification already done by protectedHouseholdAction
            const locationId = parcelsData.pickupLocationId;

            // Start transaction to ensure all related data is updated atomically
            await db.transaction(async tx => {
                const now = new Date();

                // Validate that NEW parcels are not in the past
                // (Existing parcels can remain even if they become past)
                const newPastParcels = parcelsData.parcels.filter(
                    parcel => !parcel.id && parcel.pickupLatestTime <= now,
                );

                if (newPastParcels.length > 0) {
                    const { formatStockholmDate } = await import("@/app/utils/date-utils");
                    const dates = newPastParcels
                        .map(p => formatStockholmDate(new Date(p.pickupDate), "yyyy-MM-dd"))
                        .join(", ");

                    throw new ParcelValidationError(
                        `Cannot create parcels with past pickup times`,
                        [
                            {
                                field: "parcels",
                                code: "PAST_PICKUP_TIME",
                                message: `Cannot create parcels with past pickup times for: ${dates}. Please select a future time or remove these dates.`,
                                details: { affectedDates: dates },
                            },
                        ],
                    );
                }

                // Create new food parcels based on the updated schedule
                if (parcelsData.parcels && parcelsData.parcels.length > 0) {
                    // Validate all parcel assignments before creating any
                    const { validateParcelAssignments } =
                        await import("@/app/[locale]/schedule/actions");

                    const parcelsToValidate = parcelsData.parcels
                        .filter(parcel => parcel.pickupLatestTime > now || parcel.id) // Future parcels OR existing parcels being updated
                        .map(parcel => ({
                            id: parcel.id,
                            householdId: household.id,
                            locationId: parcelsData.pickupLocationId,
                            pickupDate: new Date(parcel.pickupDate),
                            pickupStartTime: parcel.pickupEarliestTime,
                            pickupEndTime: parcel.pickupLatestTime,
                        }));

                    if (parcelsToValidate.length > 0) {
                        const validationResult = await validateParcelAssignments(
                            parcelsToValidate,
                            tx,
                        );

                        if (!validationResult.success) {
                            // Throw to trigger transaction rollback
                            throw new ParcelValidationError(
                                "Parcel validation failed",
                                validationResult.errors || [],
                            );
                        }
                    }

                    // Filter to only future parcels (but allow existing parcels to be updated even if past)
                    const parcelsToSave = parcelsData.parcels
                        .filter(parcel => parcel.pickupLatestTime > now || parcel.id)
                        .map(parcel => ({
                            household_id: household.id,
                            pickup_location_id: parcelsData.pickupLocationId,
                            pickup_date_time_earliest: parcel.pickupEarliestTime,
                            pickup_date_time_latest: parcel.pickupLatestTime,
                            is_picked_up: false,
                        }));

                    // Use centralized helper for proper conflict handling
                    const { insertParcels } = await import("@/app/db/insert-parcels");
                    await insertParcels(tx, parcelsToSave);
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
                            notDeleted(),
                        ),
                    );

                // Soft delete parcels that are not in the desired schedule
                // This preserves audit trail, keeps public QR code links working,
                // and handles SMS cancellation intelligently
                const parcelsToDelete = existingFutureParcels.filter(
                    p =>
                        !desiredParcelKeys.has(
                            `${p.locationId}-${p.earliest.toISOString()}-${p.latest.toISOString()}`,
                        ),
                );

                if (parcelsToDelete.length > 0) {
                    // Import helper function for SMS-aware soft deletion
                    const { softDeleteParcelInTransaction } =
                        await import("@/app/[locale]/parcels/actions");

                    for (const parcel of parcelsToDelete) {
                        await softDeleteParcelInTransaction(
                            tx,
                            parcel.id,
                            session.user?.githubUsername || "system",
                        );
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
                const { recomputeOutsideHoursCount } =
                    await import("@/app/[locale]/schedule/actions");
                await recomputeOutsideHoursCount(locationId);
            } catch (e) {
                logError("Failed to recompute outside-hours count after parcel update", e, {
                    action: "updateHouseholdParcels",
                    locationId,
                    householdId: household.id,
                });
                // Non-fatal: The count will be corrected by the next schedule operation
            }

            return success(undefined);
        } catch (error: unknown) {
            // Check if this is a validation error from within the transaction
            if (error instanceof ParcelValidationError) {
                return validationFailure(error.message, error.validationErrors);
            }

            logError("Error updating household parcels", error, {
                action: "updateHouseholdParcels",
                householdId: household.id,
                locationId: parcelsData.pickupLocationId,
            });
            return failure({
                code: "INTERNAL_ERROR",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    },
);
