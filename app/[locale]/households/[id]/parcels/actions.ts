"use server";

import { db } from "@/app/db/drizzle";
import { FoodParcels } from "@/app/[locale]/households/enroll/types";
import { protectedAdminHouseholdAction } from "@/app/utils/auth/protected-action";
import { ParcelValidationError } from "@/app/utils/errors/validation-errors";
import {
    success,
    failure,
    validationFailure,
    type ActionResult,
} from "@/app/utils/auth/action-result";
import { logError } from "@/app/utils/logger";
import {
    applyHouseholdParcelScheduleChanges,
    runHouseholdParcelPostCommitEffects,
    type HouseholdParcelScheduleChangeSummary,
} from "@/app/utils/parcels/apply-parcel-schedule-changes";

export const updateHouseholdParcels = protectedAdminHouseholdAction(
    async (session, household, parcelsData: FoodParcels): Promise<ActionResult<void>> => {
        try {
            let changeSummary: HouseholdParcelScheduleChangeSummary | null = null;

            // Start transaction to ensure all related data is updated atomically
            await db.transaction(async tx => {
                changeSummary = await applyHouseholdParcelScheduleChanges(tx, {
                    householdId: household.id,
                    pickupLocationId: parcelsData.pickupLocationId,
                    parcels: parcelsData.parcels,
                    session,
                });
            });

            if (changeSummary) {
                await runHouseholdParcelPostCommitEffects(changeSummary, {
                    householdId: household.id,
                    logError,
                });
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
