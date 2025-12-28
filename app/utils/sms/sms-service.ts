/**
 * SMS service for managing outgoing SMS records and sending
 */

import { db } from "@/app/db/drizzle";
import { outgoingSms, foodParcels, households, pickupLocations } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { POSTGRES_ERROR_CODES } from "@/app/db/postgres-error-codes";
import { eq, and, lte, lt, sql, gt, gte } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { sendSms, type SendSmsResponse } from "./hello-sms";
import { formatPickupSms } from "./templates";
import type { SupportedLocale } from "@/app/utils/locale-detection";
import { Time } from "@/app/utils/time-provider";
import { isParcelOutsideOpeningHours } from "@/app/utils/schedule/outside-hours-filter";
import { fetchPickupLocationSchedules } from "@/app/utils/schedule/pickup-location-schedules";
import { generateUrl } from "@/app/config/branding";
import { nanoid } from "nanoid";
import { logger, logError } from "@/app/utils/logger";

export type SmsIntent =
    | "pickup_reminder"
    | "pickup_updated"
    | "pickup_cancelled"
    | "consent_enrolment" // Deprecated: use 'enrolment' instead
    | "enrolment";
export type SmsStatus = "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled";

const SMS_IDEMPOTENCY_CONSTRAINT = "idx_outgoing_sms_idempotency_unique";

// Threshold for considering a "sending" record as stale (crashed mid-send)
// 10 minutes is generous since actual sends complete in ~1-2 seconds
const STALE_SENDING_THRESHOLD_MS = 10 * 60 * 1000;

// 24 hours in milliseconds - used for SMS health stats time window
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * HTTP status codes that indicate transient errors eligible for retry.
 * Unified across both queued and JIT SMS pipelines.
 */
const RETRIABLE_HTTP_STATUS_CODES = new Set([
    429, // Rate limit
    500, // Server error
    502, // Bad gateway
    503, // Service unavailable
    504, // Gateway timeout
]);

function isRetriableHttpError(httpStatus?: number): boolean {
    return httpStatus !== undefined && RETRIABLE_HTTP_STATUS_CODES.has(httpStatus);
}

/**
 * Recover from crash gap: Delete stale pickup_reminder records stuck in "sending"
 *
 * These occur when the process crashes after inserting the record but before
 * updating the status to "sent" or "failed". Since actual SMS sends complete
 * in ~1-2 seconds, any record in "sending" status for 10+ minutes is stale.
 *
 * IMPORTANT: At-least-once delivery semantics
 * If crash occurred after SMS was sent but before DB update, deleting the record
 * makes the parcel eligible again → possible duplicate SMS. This is acceptable
 * for reminders (duplicate "pick up your food" is annoying but harmless; missing
 * reminder could mean someone doesn't get their food).
 *
 * Only pickup_reminder is auto-recovered. Other intents (enrollment, cancellation)
 * stay stuck for manual review - their duplicates could be more problematic.
 */
async function recoverStaleSendingRecords(): Promise<number> {
    const staleThreshold = new Date(Time.now().toUTC().getTime() - STALE_SENDING_THRESHOLD_MS);

    const deleted = await db
        .delete(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "sending"),
                eq(outgoingSms.intent, "pickup_reminder"),
                lt(outgoingSms.created_at, staleThreshold),
            ),
        )
        .returning({ id: outgoingSms.id });

    if (deleted.length > 0) {
        logger.warn(
            { count: deleted.length, thresholdMinutes: STALE_SENDING_THRESHOLD_MS / 60000 },
            "Recovered stale 'sending' SMS records (likely crashed mid-send)",
        );
    }

    return deleted.length;
}

/**
 * Atomically claim an SMS record for sending.
 *
 * Uses conditional UPDATE to prevent concurrent processes from sending
 * the same record. Only one process can successfully claim a record.
 *
 * @returns true if claim succeeded, false if already claimed by another process
 */
async function claimSmsForSending(id: string): Promise<boolean> {
    const now = Time.now().toUTC();
    const claimed = await db
        .update(outgoingSms)
        .set({ status: "sending" })
        .where(
            and(
                eq(outgoingSms.id, id),
                sql`${outgoingSms.status} IN ('queued', 'retrying')`,
                lte(outgoingSms.next_attempt_at, now),
            ),
        )
        .returning({ id: outgoingSms.id });

    return claimed.length === 1;
}

export interface CreateSmsData {
    intent: SmsIntent;
    parcelId?: string; // Nullable for non-parcel intents
    householdId: string;
    toE164: string;
    text: string;
    idempotencyKey?: string; // Optional - will be generated if not provided
    nextAttemptAt?: Date; // Optional - defaults to immediate sending
    tx?: Parameters<Parameters<typeof db.transaction>[0]>[0]; // Optional transaction object
}

export interface SmsRecord {
    id: string;
    intent: SmsIntent;
    parcelId?: string;
    householdId: string;
    toE164: string;
    text: string;
    status: SmsStatus;
    attemptCount: number;
    nextAttemptAt?: Date;
    lastErrorMessage?: string;
    idempotencyKey: string;
    providerMessageId?: string;
    providerStatus?: string;
    providerStatusUpdatedAt?: Date;
    dismissedAt?: Date;
    dismissedByUserId?: string;
    sentAt?: Date;
    createdAt: Date;
}

// Type for database SMS records using Drizzle's type inference
type DbSmsRecord = InferSelectModel<typeof outgoingSms>;

/**
 * Generate idempotency key for SMS deduplication
 *
 * Stable keys ensure:
 * - One automatic reminder per parcel (deduplicates within scheduling window)
 * - One enrollment SMS per household + phone combination
 * - One cancellation SMS per parcel
 *
 * For manual resends, callers should provide a unique idempotencyKey.
 *
 * IMPORTANT: Cancelled SMS behavior
 * If an SMS is cancelled (e.g., JIT found pickup passed), the stable key remains
 * in the database. If the same parcel becomes eligible again, createSmsRecord()
 * will return the existing cancelled record ID (won't create a new one).
 * This is intentional - cancelled reminders should stay cancelled.
 * For manual re-sending after cancellation, use action="resend" which generates
 * a unique key.
 */
function generateIdempotencyKey(data: CreateSmsData): string {
    switch (data.intent) {
        case "pickup_reminder":
        case "pickup_cancelled":
        case "pickup_updated":
            // These intents require a parcelId
            if (!data.parcelId) {
                throw new Error(
                    `${data.intent} SMS requires parcelId (householdId: ${data.householdId})`,
                );
            }
            return `${data.intent}|${data.parcelId}`;
        case "enrolment":
        case "consent_enrolment":
            // One enrollment SMS per household + phone number
            // This allows a new SMS when phone number changes
            return `enrolment|${data.householdId}|${data.toE164}`;
        default:
            // Fallback for any future intents
            return `${data.intent}|${data.householdId}|${data.parcelId || "no-parcel"}`;
    }
}

// Create a new SMS record. Returns the ID of the queued SMS. If an SMS with the
// same idempotency key already exists, this returns the ID of that existing
// record instead of creating a duplicate.
export async function createSmsRecord(data: CreateSmsData): Promise<string> {
    const id = nanoid(16);
    const now = Time.now().toUTC();
    const idempotencyKey = data.idempotencyKey || generateIdempotencyKey(data);
    const nextAttemptAt = data.nextAttemptAt || now; // Default to immediate if not specified

    // Use provided transaction or global db
    const dbInstance = data.tx || db;

    try {
        await dbInstance.insert(outgoingSms).values({
            id,
            intent: data.intent, // No cast needed - data.intent is already typed as SmsIntent and matches schema enum
            parcel_id: data.parcelId,
            household_id: data.householdId,
            to_e164: data.toE164,
            text: data.text,
            status: "queued",
            attempt_count: 0,
            next_attempt_at: nextAttemptAt, // Use provided time or default to now
            idempotency_key: idempotencyKey,
            created_at: now,
        });

        logger.debug(
            { intent: data.intent, householdId: data.householdId, smsId: id },
            "SMS queued",
        );
        return id;
    } catch (error: unknown) {
        // Handle unique constraint violation on idempotency key
        const dbError = error as {
            code?: string;
            constraint?: string;
            constraint_name?: string;
            detail?: string;
        };
        const constraintName =
            dbError?.constraint ||
            dbError?.constraint_name ||
            (dbError?.detail?.includes(SMS_IDEMPOTENCY_CONSTRAINT)
                ? SMS_IDEMPOTENCY_CONSTRAINT
                : undefined);

        if (
            dbError?.code === POSTGRES_ERROR_CODES.UNIQUE_VIOLATION &&
            constraintName === SMS_IDEMPOTENCY_CONSTRAINT
        ) {
            logger.debug({ idempotencyKey }, "SMS with idempotency key already exists, skipping");

            // Find and return the existing record ID
            const existing = await dbInstance
                .select({ id: outgoingSms.id })
                .from(outgoingSms)
                .where(eq(outgoingSms.idempotency_key, idempotencyKey))
                .limit(1);

            if (existing.length > 0 && existing[0]?.id) {
                return existing[0].id;
            }

            throw new Error(
                `Duplicate SMS detected for idempotency key ${idempotencyKey}, but existing record could not be fetched`,
            );
        }

        // Re-throw other errors
        throw error;
    }
}

// Get SMS records by parcel ID (for admin UI)
export async function getSmsRecordsForParcel(parcelId: string): Promise<SmsRecord[]> {
    const records = await db
        .select()
        .from(outgoingSms)
        .where(eq(outgoingSms.parcel_id, parcelId))
        .orderBy(sql`${outgoingSms.created_at} DESC`);

    return records.map(mapDbRecordToSmsRecord);
}

// Get SMS records ready for sending (includes retries due now)
export async function getSmsRecordsReadyForSending(limit = 10): Promise<SmsRecord[]> {
    const now = Time.now().toUTC();

    const records = await db
        .select()
        .from(outgoingSms)
        .where(
            and(
                sql`${outgoingSms.status} IN ('queued', 'retrying')`,
                lte(outgoingSms.next_attempt_at, now),
            ),
        )
        .limit(limit)
        .orderBy(outgoingSms.next_attempt_at);

    return records.map(mapDbRecordToSmsRecord);
}

// Update SMS status (with retry support)
export async function updateSmsStatus(
    id: string,
    status: SmsStatus,
    options: {
        errorMessage?: string;
        nextAttemptAt?: Date;
        incrementAttempt?: boolean;
        providerMessageId?: string;
    } = {},
): Promise<void> {
    const updateData: Record<string, unknown> = {
        status,
    };

    // Only increment attempt count when we're actually making a sending attempt
    if (options.incrementAttempt) {
        updateData.attempt_count = sql`${outgoingSms.attempt_count} + 1`;
    }

    if (status === "retrying" && options.nextAttemptAt) {
        updateData.next_attempt_at = options.nextAttemptAt;
        updateData.last_error_message = options.errorMessage;
    } else if (status === "failed") {
        updateData.last_error_message = options.errorMessage;
    } else if (status === "sent") {
        updateData.sent_at = Time.now().toUTC();
        // Clear any error message from previous failed attempts
        updateData.last_error_message = null;
        if (options.providerMessageId) {
            updateData.provider_message_id = options.providerMessageId;
        }
    }

    await db.update(outgoingSms).set(updateData).where(eq(outgoingSms.id, id));
}

/**
 * Update SMS record with provider delivery status from callback (with custom db instance)
 *
 * Called when HelloSMS sends a delivery status callback.
 * Updates the provider_status and provider_status_updated_at fields.
 *
 * This version accepts a database instance for use in tests or transactions.
 *
 * @param dbInstance The database instance to use
 * @param providerMessageId The apiMessageId from HelloSMS
 * @param providerStatus The delivery status text (e.g., "Delivered", "Failed")
 * @returns true if a record was updated, false if no matching record found
 */
export async function updateSmsProviderStatusWithDb(
    dbInstance: typeof db,
    providerMessageId: string,
    providerStatus: string,
): Promise<boolean> {
    const now = Time.now().toUTC();

    const updated = await dbInstance
        .update(outgoingSms)
        .set({
            provider_status: providerStatus,
            provider_status_updated_at: now,
        })
        .where(eq(outgoingSms.provider_message_id, providerMessageId))
        .returning({ id: outgoingSms.id });

    return updated.length > 0;
}

/**
 * Update SMS record with provider delivery status from callback
 *
 * Called when HelloSMS sends a delivery status callback.
 * Updates the provider_status and provider_status_updated_at fields.
 *
 * @param providerMessageId The apiMessageId from HelloSMS
 * @param providerStatus The delivery status text (e.g., "Delivered", "Failed")
 * @returns true if a record was updated, false if no matching record found
 */
export async function updateSmsProviderStatus(
    providerMessageId: string,
    providerStatus: string,
): Promise<boolean> {
    return updateSmsProviderStatusWithDb(db, providerMessageId, providerStatus);
}

// Check if SMS already exists for a parcel + intent
export async function smsExistsForParcel(parcelId: string, intent: SmsIntent): Promise<boolean> {
    const existing = await db
        .select({ id: outgoingSms.id })
        .from(outgoingSms)
        .where(and(eq(outgoingSms.parcel_id, parcelId), eq(outgoingSms.intent, intent)))
        .limit(1);

    return existing.length > 0;
}

/**
 * Queue a pickup_updated SMS when a parcel is rescheduled.
 *
 * Only sends if:
 * 1. A pickup_reminder SMS was already sent for this parcel
 * 2. No pickup_updated SMS already exists for this parcel (idempotency)
 *
 * @returns Object with success status and record ID (if created)
 */
export async function queuePickupUpdatedSms(parcelId: string): Promise<{
    success: boolean;
    recordId?: string;
    skipped?: boolean;
    reason?: string;
}> {
    // Check if pickup_reminder was already sent
    const existingReminder = await db
        .select({ id: outgoingSms.id, status: outgoingSms.status })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.parcel_id, parcelId),
                eq(outgoingSms.intent, "pickup_reminder"),
                eq(outgoingSms.status, "sent"),
            ),
        )
        .limit(1);

    if (existingReminder.length === 0) {
        return {
            success: true,
            skipped: true,
            reason: "No sent pickup_reminder exists for this parcel",
        };
    }

    // Get parcel and household data
    const parcelData = await db
        .select({
            parcelId: foodParcels.id,
            householdId: households.id,
            phone: households.phone_number,
            locale: households.locale,
            pickupDate: foodParcels.pickup_date_time_earliest,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .where(and(eq(foodParcels.id, parcelId), notDeleted()))
        .limit(1);

    if (parcelData.length === 0) {
        return { success: false, reason: "Parcel not found" };
    }

    const data = parcelData[0];

    // Generate SMS content using dynamic imports to avoid circular dependencies
    const { formatUpdateSms } = await import("./templates");
    const { generateUrl } = await import("@/app/config/branding");

    const publicUrl = generateUrl(`/p/${parcelId}`);
    const smsText = formatUpdateSms(
        { pickupDate: data.pickupDate, publicUrl },
        data.locale as SupportedLocale,
    );

    // Create SMS record (idempotency key will prevent duplicates)
    try {
        const smsId = await createSmsRecord({
            intent: "pickup_updated",
            parcelId: data.parcelId,
            householdId: data.householdId,
            toE164: data.phone,
            text: smsText,
        });

        logger.info({ smsId, parcelId }, "Pickup updated SMS queued");
        return { success: true, recordId: smsId };
    } catch (error) {
        logError("Failed to queue pickup_updated SMS", error, { parcelId });
        return {
            success: false,
            reason: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Fetch fresh parcel and household data for JIT SMS rendering
 * Returns null if parcel doesn't exist or is no longer eligible for SMS
 */
async function getFreshParcelData(parcelId: string): Promise<{
    phoneNumber: string;
    locale: SupportedLocale;
    pickupEarliest: Date;
    pickupLatest: Date;
    isDeleted: boolean;
    isPickedUp: boolean;
    householdAnonymized: boolean;
} | null> {
    const result = await db
        .select({
            phoneNumber: households.phone_number,
            locale: households.locale,
            pickupEarliest: foodParcels.pickup_date_time_earliest,
            pickupLatest: foodParcels.pickup_date_time_latest,
            deletedAt: foodParcels.deleted_at,
            isPickedUp: foodParcels.is_picked_up,
            anonymizedAt: households.anonymized_at,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .where(eq(foodParcels.id, parcelId))
        .limit(1);

    if (result.length === 0) {
        return null;
    }

    const row = result[0];
    if (!row) {
        return null;
    }

    return {
        phoneNumber: row.phoneNumber,
        locale: row.locale as SupportedLocale,
        pickupEarliest: row.pickupEarliest,
        pickupLatest: row.pickupLatest,
        isDeleted: row.deletedAt !== null,
        isPickedUp: row.isPickedUp,
        householdAnonymized: row.anonymizedAt !== null,
    };
}

/**
 * Send SMS and update record status
 *
 * Used for sending queued SMS records (enrollment, etc.).
 *
 * Note: For pickup_reminder, pure JIT is preferred (sendReminderForParcel).
 * The JIT re-render logic below is kept as a fallback for any pickup_reminder
 * SMS that might be in the queue from legacy code or manual creation.
 *
 * @returns true if we claimed and attempted to send, false if skipped
 */
export async function sendSmsRecord(record: SmsRecord): Promise<boolean> {
    // Atomically claim the record FIRST (prevents concurrent sends and DB updates)
    const claimed = await claimSmsForSending(record.id);
    if (!claimed) {
        // Another process already claimed this record, skip
        logger.debug({ smsId: record.id }, "SMS already claimed by another process, skipping");
        return false;
    }

    // JIT re-render for pickup_reminder (fallback for queued records)
    // Done AFTER claim to avoid loser updating DB before returning
    if (record.intent === "pickup_reminder" && record.parcelId) {
        const freshData = await getFreshParcelData(record.parcelId);

        // Check if parcel is no longer eligible for SMS
        const now = Time.now().toUTC();
        const pickupHasPassed = freshData && freshData.pickupLatest < now;

        if (
            !freshData ||
            freshData.isDeleted ||
            freshData.isPickedUp ||
            freshData.householdAnonymized ||
            pickupHasPassed
        ) {
            logger.info(
                {
                    smsId: record.id,
                    parcelId: record.parcelId,
                    reason: !freshData
                        ? "parcel_not_found"
                        : freshData.isDeleted
                          ? "parcel_deleted"
                          : freshData.isPickedUp
                            ? "parcel_picked_up"
                            : freshData.householdAnonymized
                              ? "household_anonymized"
                              : "pickup_time_passed",
                },
                "SMS cancelled - parcel no longer eligible",
            );
            await updateSmsStatus(record.id, "cancelled");
            return false; // Claimed but cancelled, not a "processed" send
        }

        // Re-render SMS with current data
        const publicUrl = generateUrl(`/p/${record.parcelId}`);
        const smsText = formatPickupSms(
            { pickupDate: freshData.pickupEarliest, publicUrl },
            freshData.locale,
        );

        // Update record with fresh data (phone number and text may have changed)
        if (freshData.phoneNumber !== record.toE164 || smsText !== record.text) {
            await db
                .update(outgoingSms)
                .set({
                    to_e164: freshData.phoneNumber,
                    text: smsText,
                })
                .where(eq(outgoingSms.id, record.id));

            // Update the in-memory record for sending
            record.toE164 = freshData.phoneNumber;
            record.text = smsText;

            logger.debug(
                { smsId: record.id, parcelId: record.parcelId },
                "SMS updated with fresh data at send time",
            );
        }
    }

    try {
        const result: SendSmsResponse = await sendSms({
            to: record.toE164,
            text: record.text,
        });

        if (result.success) {
            await updateSmsStatus(record.id, "sent", {
                providerMessageId: result.messageId,
                incrementAttempt: true,
            });
        } else {
            await handleSmsFailure(record, result);
        }
    } catch (error) {
        await handleSmsFailure(record, {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }

    return true; // Claimed and attempted to send (success or failure)
}

// Handle SMS sending failures with simple retry logic
async function handleSmsFailure(record: SmsRecord, result: SendSmsResponse): Promise<void> {
    const maxAttempts = 3; // Total attempts: initial + 2 retries
    const currentAttempt = record.attemptCount + 1; // This is the attempt we just made

    // Check if we should retry based on error type (uses unified retry codes)
    const shouldRetry = currentAttempt < maxAttempts && isRetriableHttpError(result.httpStatus);

    if (shouldRetry) {
        // Simple backoff: 5 minutes, then 30 minutes
        const backoffMinutes = currentAttempt === 1 ? 5 : 30;
        const nextAttemptAt = Time.now().addMinutes(backoffMinutes).toUTC();

        logger.info(
            {
                intent: record.intent,
                householdId: record.householdId,
                backoffMinutes,
                attempt: currentAttempt,
                maxAttempts,
            },
            "SMS retry scheduled",
        );

        await updateSmsStatus(record.id, "retrying", {
            errorMessage: result.error,
            nextAttemptAt,
            incrementAttempt: true, // Increment only when we actually retry
        });
    } else {
        logError("SMS failed permanently", new Error(result.error || "Unknown error"), {
            intent: record.intent,
            householdId: record.householdId,
            attempts: currentAttempt,
        });

        await updateSmsStatus(record.id, "failed", {
            errorMessage: result.error,
            incrementAttempt: true, // Increment for the final failed attempt
        });
    }
}

// Remove complex retry logic - SIMPLIFIED

// Map database record to SmsRecord interface
function mapDbRecordToSmsRecord(dbRecord: DbSmsRecord): SmsRecord {
    return {
        id: dbRecord.id,
        intent: dbRecord.intent,
        parcelId: dbRecord.parcel_id ?? undefined,
        householdId: dbRecord.household_id,
        toE164: dbRecord.to_e164,
        text: dbRecord.text,
        status: dbRecord.status,
        attemptCount: dbRecord.attempt_count,
        nextAttemptAt: dbRecord.next_attempt_at ?? undefined,
        lastErrorMessage: dbRecord.last_error_message ?? undefined,
        idempotencyKey: dbRecord.idempotency_key,
        providerMessageId: dbRecord.provider_message_id ?? undefined,
        providerStatus: dbRecord.provider_status ?? undefined,
        providerStatusUpdatedAt: dbRecord.provider_status_updated_at ?? undefined,
        dismissedAt: dbRecord.dismissed_at ?? undefined,
        dismissedByUserId: dbRecord.dismissed_by_user_id ?? undefined,
        sentAt: dbRecord.sent_at ?? undefined,
        createdAt: dbRecord.created_at,
    };
}

/**
 * Get parcels eligible for automatic reminder SMS
 *
 * Used by the pure JIT scheduler which:
 * 1. Finds eligible parcels (this function)
 * 2. Renders SMS with current data
 * 3. Sends immediately
 * 4. Creates record with result (sent/failed)
 *
 * Criteria:
 * - Pickup earliest time within 48h from now
 * - Pickup latest time not yet passed (still within pickup window)
 * - Not deleted, not picked up
 * - Household not anonymized
 * - No existing reminder SMS (any status blocks auto-enqueue; use manual resend)
 */
export async function getParcelsNeedingReminder(): Promise<
    Array<{
        parcelId: string;
        householdId: string;
        householdName: string;
        phone: string;
        locale: string;
        pickupDate: Date;
        pickupLatestDate: Date;
        locationId: string;
        locationName: string;
        locationAddress: string;
    }>
> {
    const now = Time.now();
    const nowUtc = now.toUTC();
    const reminderWindow = now.addMinutes(48 * 60).toUTC(); // 48 hours from now

    const parcels = await db
        .select({
            parcelId: foodParcels.id,
            householdId: households.id,
            householdName: sql<string>`${households.first_name} || ' ' || ${households.last_name}`,
            phone: households.phone_number,
            locale: households.locale,
            pickupDate: foodParcels.pickup_date_time_earliest,
            pickupLatestDate: foodParcels.pickup_date_time_latest,
            locationId: pickupLocations.id,
            locationName: pickupLocations.name,
            locationAddress: pickupLocations.street_address,
        })
        .from(foodParcels)
        .innerJoin(households, eq(foodParcels.household_id, households.id))
        .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
        .leftJoin(
            outgoingSms,
            and(
                eq(outgoingSms.parcel_id, foodParcels.id),
                eq(outgoingSms.intent, "pickup_reminder"),
                // Match ANY existing pickup_reminder (including cancelled/failed)
                // Cancelled reminders stay cancelled; use manual resend to override
            ),
        )
        .where(
            and(
                // Pickup earliest must be within 48h window
                lte(foodParcels.pickup_date_time_earliest, reminderWindow),
                // Pickup latest must not have passed (still within pickup window)
                gt(foodParcels.pickup_date_time_latest, nowUtc),
                eq(foodParcels.is_picked_up, false),
                sql`${outgoingSms.id} IS NULL`, // No existing SMS for this parcel
                sql`${households.anonymized_at} IS NULL`, // Household not anonymized
                notDeleted(),
            ),
        );

    // Filter out parcels that are outside opening hours
    // Cache schedules by locationId to avoid N+1 queries
    const scheduleCache = new Map<
        string,
        Awaited<ReturnType<typeof fetchPickupLocationSchedules>>
    >();
    const validParcels = [];
    let filteredCount = 0;

    for (const parcel of parcels) {
        try {
            // Get location schedules (cached to avoid N+1)
            let locationSchedules = scheduleCache.get(parcel.locationId);
            if (!locationSchedules) {
                locationSchedules = await fetchPickupLocationSchedules(parcel.locationId);
                scheduleCache.set(parcel.locationId, locationSchedules);
            }

            if (
                !locationSchedules ||
                !locationSchedules.schedules ||
                locationSchedules.schedules.length === 0
            ) {
                // If no schedules available, include the parcel (fail-safe approach)
                validParcels.push(parcel);
                continue;
            }

            // Check if parcel is outside opening hours
            const parcelTimeInfo = {
                id: parcel.parcelId,
                pickupEarliestTime: parcel.pickupDate,
                pickupLatestTime: parcel.pickupLatestDate,
                isPickedUp: false,
            };

            // Use onError: "throw" so errors propagate to our catch block,
            // which implements fail-safe behavior (include parcel on error)
            const isOutsideHours = isParcelOutsideOpeningHours(parcelTimeInfo, locationSchedules, {
                onError: "throw",
            });

            if (!isOutsideHours) {
                validParcels.push(parcel);
            } else {
                filteredCount++;
            }
        } catch (error) {
            // If there's an error checking opening hours, include the parcel (fail-safe)
            logger.warn(
                { parcelId: parcel.parcelId, error },
                "Could not validate opening hours for parcel",
            );
            validParcels.push(parcel);
        }
    }

    if (filteredCount > 0) {
        logger.info(
            { eligible: validParcels.length, filtered: filteredCount },
            "SMS filtering completed",
        );
    }

    return validParcels.map(p => ({
        parcelId: p.parcelId,
        householdId: p.householdId,
        householdName: p.householdName,
        phone: p.phone,
        locale: p.locale,
        pickupDate: p.pickupDate,
        pickupLatestDate: p.pickupLatestDate,
        locationId: p.locationId,
        locationName: p.locationName,
        locationAddress: p.locationAddress,
    }));
}

/**
 * Run SMS queue processing function
 *
 * Concurrency is handled by atomic claim in sendSmsRecord() - each record
 * is claimed with a conditional UPDATE before sending, preventing duplicates.
 */
export async function processQueuedSms(processingFunction: () => Promise<number>): Promise<number> {
    return processingFunction();
}

/**
 * Pure JIT SMS sending for a single parcel
 *
 * Safe send order to prevent duplicate SMS on crash:
 * 1. Insert record with "sending" status (idempotency key prevents duplicates)
 * 2. Send SMS via HelloSMS
 * 3. Update record with final status (sent/failed)
 *
 * If crash occurs:
 * - After insert, before send: record is "sending", no SMS sent (can retry)
 * - After send, before update: record is "sending", SMS may have been sent (recovery may resend)
 *
 * @returns Object with success status and record ID (if created)
 */
export async function sendReminderForParcel(parcel: {
    parcelId: string;
    householdId: string;
    phone: string;
    locale: string;
    pickupDate: Date;
}): Promise<{ success: boolean; recordId?: string; error?: string }> {
    const { formatPickupSms } = await import("./templates");
    const { generateUrl } = await import("@/app/config/branding");
    const { sendSms } = await import("./hello-sms");

    const id = nanoid(16);
    const now = Time.now().toUTC();
    const idempotencyKey = `pickup_reminder|${parcel.parcelId}`;

    // Render SMS with current data
    const publicUrl = generateUrl(`/p/${parcel.parcelId}`);
    const smsText = formatPickupSms(
        { pickupDate: parcel.pickupDate, publicUrl },
        parcel.locale as SupportedLocale,
    );

    // Step 1: Insert record with "sending" status first (prevents duplicates)
    try {
        await db.insert(outgoingSms).values({
            id,
            intent: "pickup_reminder",
            parcel_id: parcel.parcelId,
            household_id: parcel.householdId,
            to_e164: parcel.phone,
            text: smsText,
            status: "sending",
            attempt_count: 1,
            next_attempt_at: now,
            idempotency_key: idempotencyKey,
            created_at: now,
        });
    } catch (dbError: unknown) {
        // Handle idempotency constraint violation (SMS already exists/being sent)
        const err = dbError as {
            code?: string;
            constraint?: string;
            constraint_name?: string;
            detail?: string;
        };
        const constraintName =
            err?.constraint ||
            err?.constraint_name ||
            (err?.detail?.includes(SMS_IDEMPOTENCY_CONSTRAINT)
                ? SMS_IDEMPOTENCY_CONSTRAINT
                : undefined);
        if (
            err?.code === POSTGRES_ERROR_CODES.UNIQUE_VIOLATION &&
            constraintName === SMS_IDEMPOTENCY_CONSTRAINT
        ) {
            logger.debug(
                { parcelId: parcel.parcelId, idempotencyKey },
                "SMS already exists for parcel, skipping",
            );
            return { success: true }; // Already handled by another process
        }
        throw dbError;
    }

    // Step 1.5: Revalidate parcel is still eligible (prevents race conditions)
    // Between getParcelsNeedingReminder() and now, the parcel could have been
    // deleted, picked up, or the household anonymized
    const freshData = await getFreshParcelData(parcel.parcelId);
    const now2 = Time.now().toUTC();
    const pickupHasPassed = freshData && freshData.pickupLatest < now2;

    if (
        !freshData ||
        freshData.isDeleted ||
        freshData.isPickedUp ||
        freshData.householdAnonymized ||
        pickupHasPassed
    ) {
        logger.info(
            {
                smsId: id,
                parcelId: parcel.parcelId,
                reason: !freshData
                    ? "parcel_not_found"
                    : freshData.isDeleted
                      ? "parcel_deleted"
                      : freshData.isPickedUp
                        ? "parcel_picked_up"
                        : freshData.householdAnonymized
                          ? "household_anonymized"
                          : "pickup_time_passed",
            },
            "SMS cancelled during JIT - parcel no longer eligible",
        );
        await db.update(outgoingSms).set({ status: "cancelled" }).where(eq(outgoingSms.id, id));
        return { success: false, recordId: id, error: "Parcel no longer eligible" };
    }

    // Re-render SMS if phone number or locale changed
    let phoneToUse = parcel.phone;
    let textToUse = smsText;
    if (freshData.phoneNumber !== parcel.phone || freshData.locale !== parcel.locale) {
        phoneToUse = freshData.phoneNumber;
        const newText = formatPickupSms(
            { pickupDate: freshData.pickupEarliest, publicUrl },
            freshData.locale,
        );
        textToUse = newText;

        // Update the record with fresh data
        await db
            .update(outgoingSms)
            .set({ to_e164: phoneToUse, text: textToUse })
            .where(eq(outgoingSms.id, id));

        logger.debug(
            { smsId: id, parcelId: parcel.parcelId },
            "SMS updated with fresh data during JIT",
        );
    }

    // Step 2: Send SMS
    try {
        const result = await sendSms({
            to: phoneToUse,
            text: textToUse,
        });

        // Step 3: Update record with final status
        if (result.success) {
            const updateTime = Time.now().toUTC();
            await db
                .update(outgoingSms)
                .set({
                    status: "sent",
                    sent_at: updateTime,
                    provider_message_id: result.messageId,
                    last_error_message: null,
                })
                .where(eq(outgoingSms.id, id));
            logger.info({ smsId: id, parcelId: parcel.parcelId }, "SMS sent successfully (JIT)");
            return { success: true, recordId: id };
        } else {
            // Handle failure with retry logic
            await handleJitFailure(id, parcel.parcelId, freshData.pickupLatest, result);
            return { success: false, recordId: id, error: result.error };
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logError("Failed to send SMS (JIT)", error, { parcelId: parcel.parcelId });

        // Handle exception with retry logic (treat as retriable if pickup hasn't passed)
        await handleJitFailure(id, parcel.parcelId, freshData.pickupLatest, {
            success: false,
            error: errorMessage,
            httpStatus: 500, // Treat exceptions as server errors (retriable)
        });

        return { success: false, recordId: id, error: errorMessage };
    }
}

/**
 * Handle JIT SMS failures with retry logic
 *
 * Unlike permanent failures, transient errors (429, 500, 503) are retried
 * unless max attempts reached or pickup time has passed.
 */
async function handleJitFailure(
    smsId: string,
    parcelId: string,
    pickupLatest: Date,
    result: SendSmsResponse,
): Promise<void> {
    const maxAttempts = 3;
    const now = Time.now().toUTC();

    // Don't retry if pickup time has passed
    if (pickupLatest < now) {
        logger.info({ smsId, parcelId }, "SMS failed permanently - pickup time already passed");
        await db
            .update(outgoingSms)
            .set({
                status: "failed",
                last_error_message: result.error || "Pickup time passed",
            })
            .where(eq(outgoingSms.id, smsId));
        return;
    }

    // Get current attempt count
    const [record] = await db
        .select({ attemptCount: outgoingSms.attempt_count })
        .from(outgoingSms)
        .where(eq(outgoingSms.id, smsId));

    const currentAttempt = record?.attemptCount ?? 1;
    // Check if we should retry based on error type (uses unified retry codes)
    const shouldRetry = currentAttempt < maxAttempts && isRetriableHttpError(result.httpStatus);

    if (shouldRetry) {
        // Simple backoff: 5 minutes, then 30 minutes
        const backoffMinutes = currentAttempt === 1 ? 5 : 30;
        const nextAttemptAt = Time.now().addMinutes(backoffMinutes).toUTC();

        logger.info(
            {
                smsId,
                parcelId,
                backoffMinutes,
                attempt: currentAttempt,
                maxAttempts,
            },
            "SMS retry scheduled (JIT)",
        );

        // Don't increment attempt_count here - it was set to 1 on insert (counting the JIT attempt).
        // The queued pipeline will increment when it picks up and retries.
        await db
            .update(outgoingSms)
            .set({
                status: "retrying",
                last_error_message: result.error,
                next_attempt_at: nextAttemptAt,
            })
            .where(eq(outgoingSms.id, smsId));
    } else {
        logError("SMS failed permanently (JIT)", new Error(result.error || "Unknown error"), {
            smsId,
            parcelId,
            attempts: currentAttempt,
        });

        await db
            .update(outgoingSms)
            .set({
                status: "failed",
                last_error_message: result.error,
            })
            .where(eq(outgoingSms.id, smsId));
    }
}

/**
 * Get SMS health statistics for monitoring/alerting
 *
 * Returns counts of SMS by status for the last 24 hours, plus stale unconfirmed SMS.
 * Used by the daily SMS health report to Slack.
 *
 * @returns Statistics object with counts and whether there are any issues
 */
export async function getSmsHealthStats(): Promise<{
    sent: number;
    delivered: number;
    providerFailed: number;
    notDelivered: number;
    awaiting: number;
    internalFailed: number;
    staleUnconfirmed: number;
    hasIssues: boolean;
}> {
    const now = Time.now().toUTC();
    const twentyFourHoursAgo = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

    // Query 1: Last 24h stats for sent SMS (based on sent_at)
    // Using gte to include SMS sent exactly at the 24h boundary
    const sentStatsResult = await db
        .select({
            sent: sql<number>`COUNT(*) FILTER (WHERE ${outgoingSms.status} = 'sent')`,
            delivered: sql<number>`COUNT(*) FILTER (WHERE ${outgoingSms.status} = 'sent' AND ${outgoingSms.provider_status} = 'delivered')`,
            providerFailed: sql<number>`COUNT(*) FILTER (WHERE ${outgoingSms.status} = 'sent' AND ${outgoingSms.provider_status} = 'failed')`,
            notDelivered: sql<number>`COUNT(*) FILTER (WHERE ${outgoingSms.status} = 'sent' AND ${outgoingSms.provider_status} = 'not delivered')`,
            awaiting: sql<number>`COUNT(*) FILTER (WHERE ${outgoingSms.status} = 'sent' AND ${outgoingSms.provider_status} IS NULL)`,
        })
        .from(outgoingSms)
        .where(
            and(
                gte(outgoingSms.sent_at, twentyFourHoursAgo),
                sql`${outgoingSms.dismissed_at} IS NULL`,
            ),
        );

    // Query 1b: Internal failures (based on created_at since they never got sent_at)
    // Using gte to include failures created exactly at the 24h boundary
    const failedStatsResult = await db
        .select({
            internalFailed: sql<number>`COUNT(*)`,
        })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "failed"),
                gte(outgoingSms.created_at, twentyFourHoursAgo),
                sql`${outgoingSms.dismissed_at} IS NULL`,
            ),
        );

    // Query 2: Stale unconfirmed (sent > 24h ago, no provider status, not dismissed)
    // Using lt (strictly older than 24h) so boundary case falls into "awaiting" not "stale"
    const staleResult = await db
        .select({
            count: sql<number>`COUNT(*)`,
        })
        .from(outgoingSms)
        .where(
            and(
                eq(outgoingSms.status, "sent"),
                sql`${outgoingSms.provider_status} IS NULL`,
                lt(outgoingSms.sent_at, twentyFourHoursAgo),
                sql`${outgoingSms.dismissed_at} IS NULL`,
            ),
        );

    const sentStats = sentStatsResult[0] || {
        sent: 0,
        delivered: 0,
        providerFailed: 0,
        notDelivered: 0,
        awaiting: 0,
    };
    const internalFailed = Number(failedStatsResult[0]?.internalFailed || 0);
    const staleUnconfirmed = staleResult[0]?.count || 0;

    // Determine if there are any issues worth alerting about
    const hasIssues =
        internalFailed > 0 ||
        Number(sentStats.providerFailed) > 0 ||
        Number(sentStats.notDelivered) > 0 ||
        Number(staleUnconfirmed) > 0;

    return {
        sent: Number(sentStats.sent),
        delivered: Number(sentStats.delivered),
        providerFailed: Number(sentStats.providerFailed),
        notDelivered: Number(sentStats.notDelivered),
        awaiting: Number(sentStats.awaiting),
        internalFailed,
        staleUnconfirmed: Number(staleUnconfirmed),
        hasIssues,
    };
}

/**
 * Pure JIT SMS processing for pickup reminders
 *
 * This is the main scheduler function for pure JIT:
 * 1. Recovers any stale "sending" records from crashed processes
 * 2. Finds all eligible parcels (within 48h, no existing SMS)
 * 3. For each: insert "sending" → send → update to "sent/failed"
 *
 * Concurrency is handled by idempotency constraint on insert - if two
 * processes try the same parcel, the second insert fails and skips.
 *
 * @returns Count of SMS processed
 */
export async function processRemindersJIT(): Promise<{ processed: number }> {
    // Recover any stale "sending" records from crashed processes
    await recoverStaleSendingRecords();

    const parcels = await getParcelsNeedingReminder();

    if (parcels.length === 0) {
        return { processed: 0 };
    }

    logger.info({ count: parcels.length }, "Processing eligible parcels for SMS (pure JIT)");

    let processedCount = 0;

    for (const parcel of parcels) {
        const result = await sendReminderForParcel(parcel);
        if (result.recordId) {
            processedCount++;
        }

        // Small delay between sends to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (processedCount > 0) {
        logger.info(
            { processed: processedCount, total: parcels.length },
            "SMS batch completed (pure JIT)",
        );
    }

    return { processed: processedCount };
}
