"use server";

import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import { households } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import {
    canRemoveHousehold,
    removeHousehold,
    type RemovalResult,
} from "@/app/utils/anonymization/anonymize-household";
import { revalidatePath } from "next/cache";

/**
 * Input for household removal
 */
interface RemoveHouseholdInput {
    householdId: string;
    lastNameConfirmation: string;
}

/**
 * Remove household (with smart logic: delete or anonymize based on parcel history)
 *
 * Requires:
 * - Last name confirmation (case-insensitive, whitespace-normalized)
 * - No upcoming parcels
 */
export const removeHouseholdAction = protectedAction(
    async (session, input: RemoveHouseholdInput): Promise<ActionResult<RemovalResult>> => {
        try {
            const { householdId, lastNameConfirmation } = input;

            // 1. Fetch household to verify it exists and get last name
            const household = await db
                .select({
                    id: households.id,
                    lastName: households.last_name,
                    anonymizedAt: households.anonymized_at,
                })
                .from(households)
                .where(eq(households.id, householdId))
                .limit(1);

            if (household.length === 0) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Household not found",
                });
            }

            const householdData = household[0];

            // 2. Check if already anonymized
            if (householdData.anonymizedAt) {
                return failure({
                    code: "ALREADY_ANONYMIZED",
                    message: "Household has already been removed",
                });
            }

            // 3. Verify last name confirmation (case-insensitive, normalized whitespace)
            const normalize = (str: string) => str.toLowerCase().trim().replace(/\s+/g, " ");

            if (normalize(lastNameConfirmation) !== normalize(householdData.lastName)) {
                return failure({
                    code: "CONFIRMATION_MISMATCH",
                    message: "Last name does not match",
                });
            }

            // 4. Check if removal is allowed (no upcoming parcels)
            const canRemove = await canRemoveHousehold(householdId);
            if (!canRemove.allowed) {
                return failure({
                    code: "HAS_UPCOMING_PARCELS",
                    message: `Cannot remove: ${canRemove.upcomingParcelCount} upcoming parcel(s)`,
                });
            }

            // 5. Remove household (smart logic: delete or anonymize)
            const username = session.user?.githubUsername || "unknown";
            const result = await removeHousehold(householdId, username);

            // 6. Revalidate household list and detail pages
            revalidatePath("/[locale]/households", "page");
            revalidatePath(`/[locale]/households/${householdId}`, "page");

            return success(result);
        } catch (error) {
            console.error("Error removing household:", error);
            return failure({
                code: "REMOVAL_FAILED",
                message: error instanceof Error ? error.message : "Failed to remove household",
            });
        }
    },
);
