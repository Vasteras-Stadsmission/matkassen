"use server";

import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, households } from "@/app/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { notDeleted } from "@/app/db/query-helpers";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { generateCancellationSmsText } from "@/app/utils/sms/templates";
import { Time } from "@/app/utils/time-provider";

interface SoftDeleteParcelResult {
    parcelId: string;
    smsCancelled: boolean;
    smsSent: boolean;
}

/**
 * Helper function to soft delete a parcel with SMS handling within a transaction.
 * Can be called from other actions that need to delete parcels.
 *
 * @param tx - Drizzle transaction object
 * @param parcelId - ID of the parcel to delete
 * @param deletedByUserId - GitHub username of user performing deletion
 * @returns Object with SMS handling information
 */
export async function softDeleteParcelInTransaction(
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    parcelId: string,
    deletedByUserId: string,
): Promise<{ smsCancelled: boolean; smsSent: boolean }> {
    // Get parcel with household info (needed for SMS)
    const parcelResult = await tx
        .select({
            parcel: foodParcels,
            household: households,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .where(and(eq(foodParcels.id, parcelId), notDeleted()))
        .limit(1);

    if (parcelResult.length === 0) {
        // Parcel not found or already deleted - silently skip
        return { smsCancelled: false, smsSent: false };
    }

    const { parcel, household } = parcelResult[0];

    // Check for existing SMS records for this parcel (ordered newest first)
    const smsRecords = await tx
        .select()
        .from(outgoingSms)
        .where(and(eq(outgoingSms.parcel_id, parcelId), eq(outgoingSms.intent, "pickup_reminder")))
        .orderBy(desc(outgoingSms.created_at));

    let smsCancelled = false;
    let smsSent = false;

    // Handle SMS cancellation logic - process ALL records to prevent orphaned reminders
    for (const sms of smsRecords) {
        if (sms.status === "queued" || sms.status === "sending") {
            // Case 1: SMS not yet sent or in-flight - cancel silently
            // "sending" status means HTTP request is active but can still be effectively cancelled
            // since the SMS processor won't pick it up again with cancelled status
            await tx
                .update(outgoingSms)
                .set({ status: "cancelled" })
                .where(eq(outgoingSms.id, sms.id));
            smsCancelled = true;
        } else if (sms.status === "retrying") {
            // Case 2: SMS in retry backoff - cancel silently and clear retry attempt
            // This prevents getSmsRecordsReadyForSending from picking it up on next poll
            await tx
                .update(outgoingSms)
                .set({
                    status: "cancelled",
                    next_attempt_at: null, // Clear scheduled retry
                })
                .where(eq(outgoingSms.id, sms.id));
            smsCancelled = true;
        } else if (sms.status === "sent" && !smsSent) {
            // Case 3: SMS already delivered - too late to cancel
            // Send cancellation SMS to inform household
            const cancellationText = generateCancellationSmsText(
                household.locale,
                Time.now().toDate(),
                parcel.pickup_date_time_earliest,
            );

            // Queue cancellation SMS (will be sent by background processor)
            const { nanoid } = await import("nanoid");
            await tx.insert(outgoingSms).values({
                id: nanoid(12),
                intent: "pickup_reminder",
                parcel_id: null, // Not associated with any parcel
                household_id: household.id,
                to_e164: household.phone_number,
                text: cancellationText,
                status: "queued",
                attempt_count: 0,
                next_attempt_at: Time.now().toDate(), // Send immediately
                idempotency_key: `cancel-${parcelId}-${Date.now()}`,
            });

            smsSent = true;
        }
        // For "failed" and "cancelled" - no action needed (already in terminal state)
    }

    // Soft delete the parcel
    await tx
        .update(foodParcels)
        .set({
            deleted_at: Time.now().toDate(),
            deleted_by_user_id: deletedByUserId,
        })
        .where(eq(foodParcels.id, parcelId));

    return { smsCancelled, smsSent };
}

/**
 * Soft delete a food parcel with intelligent SMS cancellation handling
 *
 * Business logic:
 * 1. If SMS is queued/sending but not yet sent: Cancel silently (update status to "cancelled")
 * 2. If SMS already sent: Send cancellation SMS to household
 * 3. If no SMS exists: Just soft delete the parcel
 *
 * @param parcelId - ID of the parcel to soft delete
 * @returns Result containing SMS handling information
 */
export const softDeleteParcel = protectedAction(
    async (session, parcelId: string): Promise<ActionResult<SoftDeleteParcelResult>> => {
        try {
            const result = await db.transaction(async tx => {
                // 1. Get parcel to validate business rules
                const parcelResult = await tx
                    .select({
                        parcel: foodParcels,
                    })
                    .from(foodParcels)
                    .where(and(eq(foodParcels.id, parcelId), notDeleted()))
                    .limit(1);

                if (parcelResult.length === 0) {
                    throw new Error("PARCEL_NOT_FOUND");
                }

                const { parcel } = parcelResult[0];

                // 2. Validate business rules
                if (parcel.is_picked_up) {
                    throw new Error("ALREADY_PICKED_UP");
                }

                const now = Time.now();
                const pickupEnd = Time.fromDate(parcel.pickup_date_time_latest);
                if (now.isAfter(pickupEnd)) {
                    throw new Error("PAST_PARCEL");
                }

                // 3. Delegate to helper function for soft delete + SMS handling
                const { smsCancelled, smsSent } = await softDeleteParcelInTransaction(
                    tx,
                    parcelId,
                    session.user?.githubUsername || "unknown",
                );

                return {
                    parcelId,
                    smsCancelled,
                    smsSent,
                };
            });

            return success(result);
        } catch (error: unknown) {
            if (error instanceof Error && error.message === "PARCEL_NOT_FOUND") {
                return failure({
                    code: "NOT_FOUND",
                    message: "Parcel not found or already deleted",
                });
            }

            if (error instanceof Error && error.message === "ALREADY_PICKED_UP") {
                return failure({
                    code: "ALREADY_PICKED_UP",
                    message: "Cannot delete a parcel that has already been picked up",
                });
            }

            if (error instanceof Error && error.message === "PAST_PARCEL") {
                return failure({
                    code: "PAST_PARCEL",
                    message: "Cannot delete a parcel from the past",
                });
            }

            console.error("Error soft deleting parcel:", error);
            return failure({
                code: "INTERNAL_ERROR",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    },
);
