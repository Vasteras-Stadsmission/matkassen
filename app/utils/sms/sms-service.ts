/**
 * SMS service for managing outgoing SMS records and sending
 */

import { db } from "@/app/db/drizzle";
import { outgoingSms, foodParcels, households, pickupLocations } from "@/app/db/schema";
import { eq, and, lte, sql, gte } from "drizzle-orm";
import { sendSms, type SendSmsResponse } from "./hello-sms";
import { Time } from "@/app/utils/time-provider";
// Note: normalizePhoneToE164 available but not used in this service layer
// Individual functions handle normalization as needed
import { nanoid } from "nanoid";

export type SmsIntent = "pickup_reminder" | "consent_enrolment";
export type SmsStatus = "queued" | "sending" | "sent" | "retrying" | "failed";

export interface CreateSmsData {
    intent: SmsIntent;
    parcelId?: string; // Nullable for non-parcel intents
    householdId: string;
    toE164: string;
    text: string;
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
    createdAt: Date;
}

// Create a new SMS record
export async function createSmsRecord(data: CreateSmsData): Promise<string> {
    const id = nanoid(16);
    const now = Time.now().toUTC();

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
        created_at: now,
    });

    console.log(`📧 SMS record created: ${id} for ${data.toE164} (${data.intent})`);
    return id;
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
    // Mark as sending and increment attempt count
    await updateSmsStatus(record.id, "sending", { incrementAttempt: true });

    try {
        const result: SendSmsResponse = await sendSms({
            to: record.toE164,
            text: record.text,
        });

        if (result.success) {
            await updateSmsStatus(record.id, "sent");
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
    const currentAttempt = record.attemptCount + 1; // We already incremented in sendSmsRecord

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
            `⏳ SMS ${record.id} will retry in ${backoffMinutes} minutes (attempt ${currentAttempt}/${maxAttempts})`,
        );

        await updateSmsStatus(record.id, "retrying", {
            errorMessage: result.error,
            nextAttemptAt,
        });
    } else {
        console.log(
            `❌ SMS ${record.id} failed permanently after ${currentAttempt} attempts: ${result.error}`,
        );

        await updateSmsStatus(record.id, "failed", {
            errorMessage: result.error,
        });
    }
}

// Remove complex retry logic - SIMPLIFIED

// Map database record to SmsRecord interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbRecordToSmsRecord(dbRecord: any): SmsRecord {
    return {
        id: dbRecord.id,
        intent: dbRecord.intent,
        parcelId: dbRecord.parcel_id,
        householdId: dbRecord.household_id,
        toE164: dbRecord.to_e164,
        text: dbRecord.text,
        status: dbRecord.status,
        attemptCount: dbRecord.attempt_count,
        nextAttemptAt: dbRecord.next_attempt_at,
        lastErrorMessage: dbRecord.last_error_message,
        createdAt: dbRecord.created_at,
    };
}

// Get parcels that need reminder SMS (48h window)
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

    return parcels.map(p => ({
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
