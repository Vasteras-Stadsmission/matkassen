/**
 * SMS service for managing outgoing SMS records and sending
 */

import { db } from "@/app/db/drizzle";
import { outgoingSms, foodParcels, households, pickupLocations } from "@/app/db/schema";
import { POSTGRES_ERROR_CODES } from "@/app/db/postgres-error-codes";
import { eq, and, lte, sql, gte } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import { sendSms, type SendSmsResponse } from "./hello-sms";
import { Time } from "@/app/utils/time-provider";
import { isParcelOutsideOpeningHours } from "@/app/utils/schedule/outside-hours-filter";
import { getPickupLocationSchedules } from "@/app/[locale]/schedule/actions";
// Note: normalizePhoneToE164 available but not used in this service layer
// Individual functions handle normalization as needed
import { nanoid } from "nanoid";

export type SmsIntent = "pickup_reminder" | "consent_enrolment";
export type SmsStatus = "queued" | "sending" | "sent" | "retrying" | "failed";

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

        if (acquired) {
            console.log("🔒 Acquired SMS queue processing lock");
        } else {
            console.log("⏸️  SMS queue processing lock already held by another process");
        }

        return acquired;
    } catch (error) {
        console.error("Failed to acquire SMS queue lock:", error);
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
        console.log("🔓 Released SMS queue processing lock");
    } catch (error) {
        console.error("Failed to release SMS queue lock:", error);
    }
}

export interface CreateSmsData {
    intent: SmsIntent;
    parcelId?: string; // Nullable for non-parcel intents
    householdId: string;
    toE164: string;
    text: string;
    idempotencyKey?: string; // Optional - will be generated if not provided
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
    createdAt: Date;
}

// Type for database SMS records using Drizzle's type inference
type DbSmsRecord = InferSelectModel<typeof outgoingSms>;

/**
 * Generate idempotency key for SMS deduplication
 * Based on parcelId, intent, and scheduled time (rounded to hour)
 */
function generateIdempotencyKey(data: CreateSmsData): string {
    const scheduledHour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
    const parts = [data.parcelId || "no-parcel", data.intent, data.householdId, scheduledHour];
    return parts.join("|");
}

// Create a new SMS record
export async function createSmsRecord(data: CreateSmsData): Promise<string> {
    const id = nanoid(16);
    const now = Time.now().toUTC();
    const idempotencyKey = data.idempotencyKey || generateIdempotencyKey(data);

    try {
        await db.insert(outgoingSms).values({
            id,
            intent: data.intent as "pickup_reminder" | "consent_enrolment",
            parcel_id: data.parcelId,
            household_id: data.householdId,
            to_e164: data.toE164,
            text: data.text,
            status: "queued",
            attempt_count: 0,
            next_attempt_at: now, // Ready to send immediately
            idempotency_key: idempotencyKey,
            created_at: now,
        });

        console.log(`📧 SMS queued: ${data.intent} for household ${data.householdId} (${id})`);
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
            console.log(`🔄 SMS with idempotency key ${idempotencyKey} already exists, skipping`);

            // Find and return the existing record ID
            const existing = await db
                .select({ id: outgoingSms.id })
                .from(outgoingSms)
                .where(eq(outgoingSms.idempotency_key, idempotencyKey))
                .limit(1);

            return existing[0]?.id || id; // Fallback to new ID if somehow not found
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
    } else if (status === "sent" && options.providerMessageId) {
        updateData.provider_message_id = options.providerMessageId;
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

// Send SMS and update record (with smart retry logic)
export async function sendSmsRecord(record: SmsRecord): Promise<void> {
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

        console.log(
            `⏳ SMS retry: ${record.intent} to household ${record.householdId} in ${backoffMinutes}min (attempt ${currentAttempt}/${maxAttempts})`,
        );

        await updateSmsStatus(record.id, "retrying", {
            errorMessage: result.error,
            nextAttemptAt,
            incrementAttempt: true, // Increment only when we actually retry
        });
    } else {
        console.log(
            `❌ SMS failed permanently: ${record.intent} to household ${record.householdId} after ${currentAttempt} attempts: ${result.error}`,
        );

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
        createdAt: dbRecord.created_at,
    };
}

// Get parcels that need reminder SMS (48h window) - excludes parcels outside opening hours
export async function getParcelsNeedingReminder(): Promise<
    Array<{
        parcelId: string;
        householdId: string;
        householdName: string;
        phone: string;
        locale: string;
        pickupDate: Date;
        locationName: string;
        locationAddress: string;
    }>
> {
    const now = Time.now();
    const start = now.addMinutes(47 * 60).toUTC(); // 47 hours from now
    const end = now.addMinutes(49 * 60).toUTC(); // 49 hours from now

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
            ),
        )
        .where(
            and(
                gte(foodParcels.pickup_date_time_earliest, start),
                lte(foodParcels.pickup_date_time_earliest, end),
                eq(foodParcels.is_picked_up, false),
                sql`${outgoingSms.id} IS NULL`, // No existing SMS
            ),
        );

    // Filter out parcels that are outside opening hours
    const validParcels = [];
    let filteredCount = 0;

    for (const parcel of parcels) {
        try {
            // Get location schedules for opening hours validation
            const locationSchedules = await getPickupLocationSchedules(parcel.locationId);

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
                console.log(
                    `🚫 SMS skipped for parcel ${parcel.parcelId}: scheduled outside opening hours`,
                );
            }
        } catch (error) {
            // If there's an error checking opening hours, include the parcel (fail-safe)
            console.warn(
                `Warning: Could not validate opening hours for parcel ${parcel.parcelId}:`,
                error,
            );
            validParcels.push(parcel);
        }
    }

    if (filteredCount > 0) {
        console.log(
            `📊 SMS filtering: ${validParcels.length} parcels eligible, ${filteredCount} filtered out (outside opening hours)`,
        );
    }

    return validParcels.map(p => ({
        parcelId: p.parcelId,
        householdId: p.householdId,
        householdName: p.householdName,
        phone: p.phone,
        locale: p.locale,
        pickupDate: p.pickupDate,
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
