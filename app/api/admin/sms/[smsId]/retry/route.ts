import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { outgoingSms, foodParcels, households } from "@/app/db/schema";
import { eq, and, gte, ne } from "drizzle-orm";
import { createSmsRecord } from "@/app/utils/sms/sms-service";
import { normalizePhoneToE164 } from "@/app/utils/sms/hello-sms";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { SMS_RATE_LIMITS } from "@/app/utils/rate-limit";
import { logger, logError } from "@/app/utils/logger";
import { Time } from "@/app/utils/time-provider";
import { nanoid } from "nanoid";

const NANOID_PATTERN = /^[A-Za-z0-9_-]{10,30}$/;

function isValidSmsId(id: string): boolean {
    return NANOID_PATTERN.test(id);
}

const RETRYABLE_INTENTS = new Set(["pickup_reminder", "pickup_updated", "pickup_cancelled"]);

/**
 * POST /api/admin/sms/[smsId]/retry - Retry a failed SMS
 *
 * Creates a new SMS record with the same intent and text as the original,
 * using the household's current phone number.
 *
 * Validations:
 * - Original SMS must be in a failed state (not dismissed)
 * - Must have a parcel_id
 * - Must be a retryable intent (pickup_reminder, pickup_updated, pickup_cancelled)
 * - Pickup must be >1h in the future
 * - 5-minute cooldown per parcel
 */
export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ smsId: string }> },
) {
    let smsId: string | undefined;

    try {
        const { smsId: rawSmsId } = await params;
        smsId = rawSmsId;

        if (!isValidSmsId(smsId)) {
            return NextResponse.json({ error: "Invalid SMS ID format" }, { status: 400 });
        }

        // Auth with rate limiting keyed on smsId
        const authResult = await authenticateAdminRequest({
            endpoint: "sms-retry",
            config: SMS_RATE_LIMITS.PARCEL_SMS,
            identifier: smsId,
        });
        if (!authResult.success) {
            return authResult.response!;
        }

        // Fetch the original SMS
        const [originalSms] = await db
            .select({
                id: outgoingSms.id,
                intent: outgoingSms.intent,
                parcelId: outgoingSms.parcel_id,
                householdId: outgoingSms.household_id,
                text: outgoingSms.text,
                status: outgoingSms.status,
                providerStatus: outgoingSms.provider_status,
                sentAt: outgoingSms.sent_at,
                dismissedAt: outgoingSms.dismissed_at,
            })
            .from(outgoingSms)
            .where(eq(outgoingSms.id, smsId))
            .limit(1);

        if (!originalSms) {
            return NextResponse.json(
                { error: "SMS not found", code: "NOT_FOUND" },
                { status: 404 },
            );
        }

        // Must be in a failed state
        const now = Time.now().toUTC();
        const staleThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const isFailed = originalSms.status === "failed";
        const isProviderFailed =
            originalSms.status === "sent" &&
            (originalSms.providerStatus === "failed" ||
                originalSms.providerStatus === "not delivered");
        const isStale =
            originalSms.status === "sent" &&
            !originalSms.providerStatus &&
            originalSms.sentAt &&
            originalSms.sentAt < staleThreshold;

        if (!isFailed && !isProviderFailed && !isStale) {
            return NextResponse.json(
                { error: "SMS is not in a failed state", code: "INVALID_ACTION" },
                { status: 400 },
            );
        }

        if (originalSms.dismissedAt) {
            return NextResponse.json(
                { error: "SMS has been dismissed", code: "INVALID_ACTION" },
                { status: 400 },
            );
        }

        if (!originalSms.parcelId) {
            return NextResponse.json(
                { error: "SMS has no associated parcel", code: "INVALID_ACTION" },
                { status: 400 },
            );
        }

        if (!RETRYABLE_INTENTS.has(originalSms.intent)) {
            return NextResponse.json(
                { error: "SMS intent is not retryable", code: "INVALID_ACTION" },
                { status: 400 },
            );
        }

        // Fetch parcel data WITHOUT notDeleted() filter - cancellation SMS implies soft-deleted parcel
        const [parcel] = await db
            .select({
                id: foodParcels.id,
                householdId: foodParcels.household_id,
                pickupEarliest: foodParcels.pickup_date_time_earliest,
            })
            .from(foodParcels)
            .where(eq(foodParcels.id, originalSms.parcelId))
            .limit(1);

        if (!parcel) {
            return NextResponse.json(
                { error: "Parcel not found", code: "PARCEL_NOT_FOUND" },
                { status: 400 },
            );
        }

        // Pickup must be >1h in the future
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        if (parcel.pickupEarliest < oneHourFromNow) {
            return NextResponse.json(
                { error: "Pickup starts in less than 1 hour", code: "TOO_LATE" },
                { status: 400 },
            );
        }

        // 5-minute cooldown per parcel (check any recent SMS for this parcel, excluding the original)
        const [recentSms] = await db
            .select({ id: outgoingSms.id })
            .from(outgoingSms)
            .where(
                and(
                    eq(outgoingSms.parcel_id, originalSms.parcelId),
                    ne(outgoingSms.id, smsId),
                    gte(outgoingSms.created_at, new Date(now.getTime() - 5 * 60 * 1000)),
                ),
            )
            .limit(1);

        if (recentSms) {
            return NextResponse.json(
                { error: "Please wait before retrying", code: "COOLDOWN_ACTIVE" },
                { status: 429 },
            );
        }

        // Fetch current household phone number
        const [household] = await db
            .select({
                phoneNumber: households.phone_number,
            })
            .from(households)
            .where(eq(households.id, parcel.householdId))
            .limit(1);

        if (!household) {
            return NextResponse.json(
                { error: "Household not found", code: "NOT_FOUND" },
                { status: 404 },
            );
        }

        // Create new SMS record and auto-dismiss the original in one transaction
        // to prevent double-click races from creating duplicate retries
        const newSmsId = await db.transaction(async tx => {
            const id = await createSmsRecord({
                intent: originalSms.intent,
                parcelId: originalSms.parcelId!,
                householdId: parcel.householdId,
                toE164: normalizePhoneToE164(household.phoneNumber),
                text: originalSms.text,
                idempotencyKey: `${originalSms.intent}|${originalSms.parcelId}|retry|${nanoid(8)}`,
                tx,
            });

            await tx
                .update(outgoingSms)
                .set({
                    dismissed_at: now,
                    dismissed_by_user_id: authResult.session!.user.githubUsername,
                })
                .where(eq(outgoingSms.id, smsId!));

            return id;
        });

        logger.info(
            {
                originalSmsId: smsId,
                newSmsId,
                parcelId: originalSms.parcelId,
                intent: originalSms.intent,
                triggeredBy: authResult.session!.user.githubUsername,
            },
            "SMS retry queued",
        );

        return NextResponse.json({ success: true, smsId: newSmsId });
    } catch (error) {
        logError("Error retrying SMS", error, {
            method: "POST",
            path: "/api/admin/sms/[smsId]/retry",
            smsId: smsId ?? "unknown",
        });
        return NextResponse.json(
            { error: "Failed to retry SMS", code: "SEND_ERROR" },
            { status: 500 },
        );
    }
}
