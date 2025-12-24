/**
 * SMS service for managing outgoing SMS records and sending
 */

import { db } from "@/app/db/drizzle";
import { outgoingSms, foodParcels, households, pickupLocations } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { POSTGRES_ERROR_CODES } from "@/app/db/postgres-error-codes";
import { eq, and, lte, sql, gt } from "drizzle-orm";
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

// Advisory lock key for SMS queue processing
const SMS_QUEUE_LOCK_KEY = "sms-queue-processing";
const SMS_IDEMPOTENCY_CONSTRAINT = "idx_outgoing_sms_idempotency_unique";

/**
 * Get numeric hash for advisory lock (PostgreSQL requires a numeric key)
 */
function getAdvisoryLockKey(key: string): number {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
}

/**
 * Acquire PostgreSQL advisory lock for SMS queue processing
 * Returns true if lock was acquired, false if already held by another process
 */
async function acquireSmsQueueLock(): Promise<boolean> {
    const lockKey = getAdvisoryLockKey(SMS_QUEUE_LOCK_KEY);

    try {
        const result = await db.execute(sql`SELECT pg_try_advisory_lock(${lockKey}) as acquired`);

        const acquired = result[0]?.acquired as boolean;

        // Only log failures - routine lock operations create too much noise
        return acquired;
    } catch (error) {
        logError("Failed to acquire SMS queue lock", error);
        return false;
    }
}

/**
 * Release PostgreSQL advisory lock for SMS queue processing
 */
async function releaseSmsQueueLock(): Promise<void> {
    const lockKey = getAdvisoryLockKey(SMS_QUEUE_LOCK_KEY);

    try {
        await db.execute(sql`SELECT pg_advisory_unlock(${lockKey})`);
        // Only log failures - routine lock operations create too much noise
    } catch (error) {
        logError("Failed to release SMS queue lock", error);
    }
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
                throw new Error(`${data.intent} SMS requires parcelId`);
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
        updateData.sent_at = new Date();
        if (options.providerMessageId) {
            updateData.provider_message_id = options.providerMessageId;
        }
    }

    await db.update(outgoingSms).set(updateData).where(eq(outgoingSms.id, id));
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
 * Send SMS and update record (with JIT re-rendering for pickup reminders)
 *
 * For pickup_reminder SMS, this function re-fetches current data at send time
 * to ensure phone numbers and pickup times are always fresh. If the parcel is
 * no longer eligible (deleted, picked up, or household anonymized), the SMS
 * is cancelled instead of sent.
 */
export async function sendSmsRecord(record: SmsRecord): Promise<void> {
    // For pickup reminders, re-fetch and re-render at send time (JIT approach)
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
            return;
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

    // Mark as sending (attempt count will be incremented only on failure)
    await updateSmsStatus(record.id, "sending");

    try {
        const result: SendSmsResponse = await sendSms({
            to: record.toE164,
            text: record.text,
        });

        if (result.success) {
            await updateSmsStatus(record.id, "sent", {
                providerMessageId: result.messageId,
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
}

// Handle SMS sending failures with simple retry logic
async function handleSmsFailure(record: SmsRecord, result: SendSmsResponse): Promise<void> {
    const maxAttempts = 3; // Total attempts: initial + 2 retries
    const currentAttempt = record.attemptCount + 1; // This is the attempt we just made

    // Check if we should retry based on error type
    const isRetriableError =
        result.httpStatus === 429 || // Rate limit
        result.httpStatus === 500 || // Server error
        result.httpStatus === 503; // Service unavailable

    const shouldRetry = currentAttempt < maxAttempts && isRetriableError;

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
        sentAt: dbRecord.sent_at ?? undefined,
        createdAt: dbRecord.created_at,
    };
}

/**
 * Get parcels eligible for automatic reminder SMS (backup for scheduler)
 *
 * Note: SMS records are primarily created at parcel insertion time (insert-parcels.ts)
 * for immediate dashboard visibility. This function serves as a backup to catch any
 * parcels that were missed (e.g., system was down during insertion).
 *
 * Criteria:
 * - Pickup earliest time within 48h from now
 * - Pickup latest time not yet passed (still within pickup window)
 * - Not deleted, not picked up
 * - Household not anonymized
 * - No existing reminder SMS (any status blocks auto-enqueue; use manual resend)
 *
 * The SMS text is re-rendered at send time (JIT) to ensure phone numbers and
 * pickup times are always fresh, regardless of when the record was created.
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

            const isOutsideHours = isParcelOutsideOpeningHours(parcelTimeInfo, locationSchedules);

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
 * Protected version of queue processing that uses advisory locks
 * to prevent concurrent execution
 */
export async function processSendQueueWithLock(
    processingFunction: () => Promise<number>,
): Promise<{ processed: number; lockAcquired: boolean }> {
    const lockAcquired = await acquireSmsQueueLock();

    if (!lockAcquired) {
        return { processed: 0, lockAcquired: false };
    }

    try {
        const processed = await processingFunction();
        return { processed, lockAcquired: true };
    } finally {
        await releaseSmsQueueLock();
    }
}
