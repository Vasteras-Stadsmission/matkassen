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
export type SmsStatus =
    | "queued"
    | "sending"
    | "sent"
    | "delivered"
    | "not_delivered"
    | "retrying"
    | "failed";

export interface CreateSmsData {
    intent: SmsIntent;
    parcelId?: string; // Nullable for non-parcel intents
    householdId: string;
    toE164: string;
    locale: string;
    text: string;
}

export interface SmsRecord {
    id: string;
    intent: SmsIntent;
    parcelId?: string;
    householdId: string;
    toE164: string;
    locale: string;
    text: string;
    status: SmsStatus;
    attemptCount: number;
    nextAttemptAt?: Date;
    providerMessageId?: string;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    createdAt: Date;
    sentAt?: Date;
    deliveredAt?: Date;
    failedAt?: Date;
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
        locale: data.locale,
        text: data.text,
        status: "queued",
        attempt_count: 0,
        next_attempt_at: now, // Set to now so it's immediately ready for sending
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

// Get SMS records ready for sending (due now)
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

// Update SMS status after sending attempt
export async function updateSmsStatus(
    id: string,
    status: SmsStatus,
    options: {
        providerMessageId?: string;
        errorCode?: string;
        errorMessage?: string;
        nextAttemptAt?: Date;
    } = {},
): Promise<void> {
    const updateData: Record<string, unknown> = {
        status,
        attempt_count: sql`${outgoingSms.attempt_count} + 1`,
    };

    if (status === "sent") {
        updateData.sent_at = Time.now().toUTC();
        updateData.provider_message_id = options.providerMessageId;
    } else if (status === "delivered") {
        updateData.delivered_at = Time.now().toUTC();
    } else if (status === "failed") {
        updateData.failed_at = Time.now().toUTC();
        updateData.last_error_code = options.errorCode;
        updateData.last_error_message = options.errorMessage;
    } else if (status === "retrying") {
        updateData.next_attempt_at = options.nextAttemptAt;
        updateData.last_error_code = options.errorCode;
        updateData.last_error_message = options.errorMessage;
    } else if (status === "not_delivered") {
        updateData.failed_at = new Date();
    }

    await db.update(outgoingSms).set(updateData).where(eq(outgoingSms.id, id));
}

// Update SMS delivery status by provider message ID (for callbacks)
export async function updateSmsDeliveryStatus(
    providerMessageId: string,
    delivered: boolean,
): Promise<boolean> {
    const status = delivered ? "delivered" : "not_delivered";
    const updateData: Record<string, unknown> = { status };

    if (delivered) {
        updateData.delivered_at = Time.now().toUTC();
    } else {
        updateData.failed_at = Time.now().toUTC();
    }

    const result = await db
        .update(outgoingSms)
        .set(updateData)
        .where(eq(outgoingSms.provider_message_id, providerMessageId))
        .returning({ id: outgoingSms.id });

    return result.length > 0;
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

// Send SMS and update record
export async function sendSmsRecord(record: SmsRecord): Promise<void> {
    // Mark as sending first
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

// Handle SMS sending failures with backoff
async function handleSmsFailure(record: SmsRecord, result: SendSmsResponse): Promise<void> {
    const maxAttempts = 4; // Total attempts: initial + 3 retries
    const nextAttemptCount = record.attemptCount + 1;

    // Check if we should retry based on error type
    const shouldRetry =
        nextAttemptCount < maxAttempts &&
        (result.httpStatus === 429 || result.httpStatus === 503 || result.httpStatus === 500);

    if (shouldRetry) {
        // Calculate backoff: 5s, 15s, 60s
        const backoffSeconds = [5, 15, 60][Math.min(nextAttemptCount - 1, 2)];
        const nextAttemptAt = Time.now()
            .addMinutes(backoffSeconds / 60)
            .toUTC();

        await updateSmsStatus(record.id, "retrying", {
            errorCode: result.httpStatus?.toString(),
            errorMessage: result.error,
            nextAttemptAt,
        });
    } else {
        await updateSmsStatus(record.id, "failed", {
            errorCode: result.httpStatus?.toString(),
            errorMessage: result.error,
        });
    }
}

// Map database record to SmsRecord interface
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapDbRecordToSmsRecord(dbRecord: any): SmsRecord {
    return {
        id: dbRecord.id,
        intent: dbRecord.intent,
        parcelId: dbRecord.parcel_id,
        householdId: dbRecord.household_id,
        toE164: dbRecord.to_e164,
        locale: dbRecord.locale,
        text: dbRecord.text,
        status: dbRecord.status,
        attemptCount: dbRecord.attempt_count,
        nextAttemptAt: dbRecord.next_attempt_at,
        providerMessageId: dbRecord.provider_message_id,
        lastErrorCode: dbRecord.last_error_code,
        lastErrorMessage: dbRecord.last_error_message,
        createdAt: dbRecord.created_at,
        sentAt: dbRecord.sent_at,
        deliveredAt: dbRecord.delivered_at,
        failedAt: dbRecord.failed_at,
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
