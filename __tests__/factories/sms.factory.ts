import { getTestDb } from "../db/test-db";
import { outgoingSms } from "@/app/db/schema";
import { TEST_NOW } from "../test-time";

let smsCounter = 0;

/**
 * Reset the SMS counter. Call this in beforeEach if needed.
 */
export function resetSmsCounter() {
    smsCounter = 0;
}

type SmsIntent = "pickup_reminder" | "pickup_updated" | "pickup_cancelled" | "consent_enrolment";
type SmsStatus = "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled";

/**
 * Create a test SMS message.
 * Requires household_id. Parcel_id is optional (for parcel-related intents).
 */
export async function createTestSms(overrides: {
    household_id: string;
    parcel_id?: string;
    intent?: SmsIntent;
    to_e164?: string;
    text?: string;
    status?: SmsStatus;
    attempt_count?: number;
    next_attempt_at?: Date;
    last_error_message?: string;
    sent_at?: Date;
}) {
    const db = await getTestDb();
    smsCounter++;

    const defaults = {
        intent: "pickup_reminder" as SmsIntent,
        to_e164: `+4670000${String(smsCounter).padStart(4, "0")}`,
        text: `Test SMS message ${smsCounter}`,
        status: "queued" as SmsStatus,
        idempotency_key: `test-sms-${TEST_NOW.getTime()}-${smsCounter}`,
        attempt_count: 0,
    };

    const [sms] = await db
        .insert(outgoingSms)
        .values({
            household_id: overrides.household_id,
            parcel_id: overrides.parcel_id,
            intent: overrides.intent ?? defaults.intent,
            to_e164: overrides.to_e164 ?? defaults.to_e164,
            text: overrides.text ?? defaults.text,
            status: overrides.status ?? defaults.status,
            idempotency_key: defaults.idempotency_key,
            attempt_count: overrides.attempt_count ?? defaults.attempt_count,
            next_attempt_at: overrides.next_attempt_at,
            last_error_message: overrides.last_error_message,
            sent_at: overrides.sent_at,
        })
        .returning();

    return sms;
}

/**
 * Create a sent SMS.
 */
export async function createTestSentSms(overrides: {
    household_id: string;
    parcel_id?: string;
    intent?: SmsIntent;
    to_e164?: string;
    text?: string;
}) {
    // Use deterministic timestamp
    const sentAt = new Date(TEST_NOW);

    return createTestSms({
        ...overrides,
        status: "sent",
        sent_at: sentAt,
        attempt_count: 1,
    });
}

/**
 * Create a queued SMS (waiting to be sent).
 */
export async function createTestQueuedSms(overrides: {
    household_id: string;
    parcel_id?: string;
    intent?: SmsIntent;
    to_e164?: string;
    text?: string;
}) {
    return createTestSms({
        ...overrides,
        status: "queued",
        attempt_count: 0,
    });
}

/**
 * Create a failed SMS.
 */
export async function createTestFailedSms(overrides: {
    household_id: string;
    parcel_id?: string;
    intent?: SmsIntent;
    to_e164?: string;
    text?: string;
    error_message?: string;
}) {
    return createTestSms({
        ...overrides,
        status: "failed",
        attempt_count: 3,
        last_error_message: overrides.error_message ?? "Test error: SMS delivery failed",
    });
}

/**
 * Create an SMS in retry state.
 */
export async function createTestRetryingSms(overrides: {
    household_id: string;
    parcel_id?: string;
    intent?: SmsIntent;
    to_e164?: string;
    text?: string;
    next_retry_in_minutes?: number;
}) {
    // Use deterministic timestamp
    const nextAttempt = new Date(
        TEST_NOW.getTime() + (overrides.next_retry_in_minutes ?? 5) * 60 * 1000,
    );

    return createTestSms({
        ...overrides,
        status: "retrying",
        attempt_count: 1,
        next_attempt_at: nextAttempt,
        last_error_message: "Temporary failure, will retry",
    });
}
