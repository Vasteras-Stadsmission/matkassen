"use server";

import { db } from "@/app/db/drizzle";
import { foodParcels } from "@/app/db/schema";
import { eq, gt, and } from "drizzle-orm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { nanoid } from "@/app/db/schema";
import { protectedHouseholdAction } from "@/app/utils/auth/protected-action";

interface ParcelUpdateResult {
    success: boolean;
    error?: string;
    validationErrors?: Array<{
        field: string;
        code: string;
        message: string;
        details?: Record<string, unknown>;
    }>;
}

export const updateHouseholdParcels = protectedHouseholdAction(
    async (session, household, parcelsData: FoodParcels): Promise<ParcelUpdateResult> => {
        try {
            // Auth and household verification already done by protectedHouseholdAction
            const locationId = parcelsData.pickupLocationId;

            // Start transaction to ensure all related data is updated atomically
            const result = await db.transaction(async tx => {
                // Delete existing future food parcels for this household
                const now = new Date();
                await tx
                    .delete(foodParcels)
                    .where(
                        and(
                            eq(foodParcels.household_id, household.id),
                            gt(foodParcels.pickup_date_time_latest, now),
                        ),
                    );

                // Create new food parcels based on the updated schedule
                if (parcelsData.parcels && parcelsData.parcels.length > 0) {
                    // Validate all parcel assignments before creating any
                    const { validateParcelAssignments } = await import(
                        "@/app/[locale]/schedule/actions"
                    );

                    const parcelsToValidate = parcelsData.parcels
                        .filter(parcel => new Date(parcel.pickupDate) > now) // Only future parcels
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
                            throw new Error(
                                JSON.stringify({
                                    code: "VALIDATION_ERROR",
                                    validationErrors: validationResult.errors,
                                }),
                            );
                        }
                    }

                    // Filter to only future parcels (safety check)
                    const futureParcels = parcelsData.parcels
                        .filter(parcel => new Date(parcel.pickupDate) > now)
                        .map(parcel => ({
                            id: nanoid(),
                            household_id: household.id,
                            pickup_location_id: parcelsData.pickupLocationId,
                            pickup_date_time_earliest: parcel.pickupEarliestTime,
                            pickup_date_time_latest: parcel.pickupLatestTime,
                            is_picked_up: false,
                        }));

                    // Only insert if there are future parcels and check for duplicates (idempotency)
                    if (futureParcels.length > 0) {
                        for (const parcel of futureParcels) {
                            const existingParcel = await tx
                                .select({ id: foodParcels.id })
                                .from(foodParcels)
                                .where(
                                    and(
                                        eq(foodParcels.household_id, household.id),
                                        eq(
                                            foodParcels.pickup_location_id,
                                            parcelsData.pickupLocationId,
                                        ),
                                        eq(
                                            foodParcels.pickup_date_time_earliest,
                                            parcel.pickup_date_time_earliest,
                                        ),
                                        eq(
                                            foodParcels.pickup_date_time_latest,
                                            parcel.pickup_date_time_latest,
                                        ),
                                    ),
                                )
                                .limit(1);

                            // Only insert if this exact parcel doesn't already exist
                            if (existingParcel.length === 0) {
                                await tx.insert(foodParcels).values([parcel]);
                            }
                        }
                    }
                }

                return { success: true };
            });

            // Recompute outside-hours count after transaction commits (with committed data)
            if (result.success) {
                try {
                    const { recomputeOutsideHoursCount } = await import(
                        "@/app/[locale]/schedule/actions"
                    );
                    await recomputeOutsideHoursCount(locationId);
                } catch (e) {
                    console.error(
                        "Failed to recompute outside-hours count after parcel update:",
                        e,
                    );
                }
            }

            return result;
        } catch (error: unknown) {
            // Check if this is a validation error from within the transaction
            if (error instanceof Error && error.message.startsWith("{")) {
                try {
                    const parsed = JSON.parse(error.message);
                    if (parsed.code === "VALIDATION_ERROR") {
                        return {
                            success: false,
                            error: "Parcel validation failed",
                            validationErrors: parsed.validationErrors,
                        };
                    }
                } catch {
                    // If parsing fails, fall through to generic error handling
                }
            }

            console.error("Error updating household parcels:", error);
            return {
                success: false,
                error: error instanceof Error ? error.message : "Unknown error occurred",
            };
        }
    },
);
