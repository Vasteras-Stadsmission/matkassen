"use server";

import { db } from "@/app/db/drizzle";
import { protectedAdminAction as protectedAgreementAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { logError } from "@/app/utils/logger";
import { softDeleteParcel as softDeleteParcelTx } from "@/app/utils/parcels/state-transitions";

interface SoftDeleteParcelResponse {
    parcelId: string;
    smsCancelled: boolean;
    smsSent: boolean;
}

/**
 * Public action: soft-delete a food parcel.
 *
 * Thin wrapper around the strict `softDeleteParcel` helper in
 * `app/utils/parcels/state-transitions.ts` — opens a transaction,
 * delegates the work, and translates the helper's discriminated result
 * into the codebase's standard `ActionResult` shape so the API DELETE
 * route can map error codes to HTTP status codes the same way it always
 * has.
 *
 * Validation, SMS handling, and the actual database write all live in
 * the helper. This file no longer contains any direct mutation of
 * `food_parcels` — see `state-transitions.ts` for the rationale.
 */
export const softDeleteParcel = protectedAgreementAction(
    async (session, parcelId: string): Promise<ActionResult<SoftDeleteParcelResponse>> => {
        try {
            const result = await db.transaction(async tx =>
                softDeleteParcelTx(tx, { parcelId, session }),
            );

            if (!result.ok) {
                return failure(result.error);
            }

            return success({
                parcelId,
                smsCancelled: result.smsCancelled,
                smsSent: result.smsSent,
            });
        } catch (error: unknown) {
            logError("Error soft deleting parcel", error, {
                action: "softDeleteParcel",
                parcelId,
                username: session.user?.githubUsername,
            });
            return failure({
                code: "INTERNAL_ERROR",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    },
);
