"use server";

import { db } from "@/app/db/drizzle";
import { foodParcels } from "@/app/db/schema";
import { eq, gt, and } from "drizzle-orm";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { nanoid } from "@/app/db/schema";
import { verifyServerActionAuth, verifyHouseholdAccess } from "@/app/utils/auth/server-action-auth";

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

export async function updateHouseholdParcels(
    householdId: string,
    parcelsData: FoodParcels,
): Promise<ParcelUpdateResult> {
    try {
        // Authorization: Verify user is authenticated and is an org member
        const authResult = await verifyServerActionAuth();
        if (!authResult.authorized) {
            return {
                success: false,
                error: authResult.error?.message || "Unauthorized",
                validationErrors: [
                    {
                        field: authResult.error?.field || "auth",
                        code: authResult.error?.code || "UNAUTHORIZED",
                        message:
                            authResult.error?.message ||
                            "You must be authenticated to perform this action",
                    },
                ],
            };
        }

        // Authorization: Verify household exists
        const householdCheck = await verifyHouseholdAccess(householdId);
        if (!householdCheck.exists) {
            return {
                success: false,
                error: householdCheck.error?.message || "Household not found",
                validationErrors: [
                    {
                        field: householdCheck.error?.field || "householdId",
                        code: householdCheck.error?.code || "HOUSEHOLD_NOT_FOUND",
                        message:
                            householdCheck.error?.message ||
                            "The specified household does not exist",
                    },
                ],
            };
        }

        // Log the action for audit trail
        console.log(
            `[AUDIT] User ${authResult.session?.user?.name} updating parcels for household ${householdId} (${householdCheck.household?.first_name} ${householdCheck.household?.last_name})`,
        );

        // Proceed with the update logic
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
                // Validate all parcel assignments before creating any
                const { validateParcelAssignments } = await import(
                    "@/app/[locale]/schedule/actions"
                );

                const parcelsToValidate = parcelsData.parcels
                    .filter(parcel => new Date(parcel.pickupDate) > now) // Only future parcels
                    .map(parcel => ({
                        householdId: householdId,
                        locationId: parcelsData.pickupLocationId,
                        pickupDate: new Date(parcel.pickupDate),
                        pickupStartTime: parcel.pickupEarliestTime,
                        pickupEndTime: parcel.pickupLatestTime,
                    }));

                if (parcelsToValidate.length > 0) {
                    const validationResult = await validateParcelAssignments(parcelsToValidate);

                    if (!validationResult.success) {
                        // Return structured validation errors
                        return {
                            success: false,
                            error: "Parcel validation failed",
                            validationErrors: validationResult.errors,
                        };
                    }
                }

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

                // Only insert if there are future parcels and check for duplicates (idempotency)
                if (futureParcels.length > 0) {
                    for (const parcel of futureParcels) {
                        const existingParcel = await tx
                            .select({ id: foodParcels.id })
                            .from(foodParcels)
                            .where(
                                and(
                                    eq(foodParcels.household_id, householdId),
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
    } catch (error: unknown) {
        console.error("Error updating household parcels:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}
