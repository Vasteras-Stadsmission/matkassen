/**
 * Integration tests for POST /api/admin/sms/[smsId]/retry route handler.
 *
 * Tests the validation logic:
 * - Happy path: retry a failed SMS successfully
 * - Non-retryable intent (e.g. enrolment)
 * - Pickup too late (< 1 hour away)
 * - 5-minute cooldown per parcel
 * - Auto-dismissal of original failure
 * - Dismissed SMS cannot be retried
 * - SMS without parcel_id cannot be retried
 * - SMS not in a failed state cannot be retried
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow, hoursFromTestNow } from "../../test-time";
import { outgoingSms } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

const ADMIN_USERNAME = "test-admin";

vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn((_options?: unknown) =>
        Promise.resolve({
            success: true,
            session: {
                user: {
                    id: "test-admin-id",
                    role: "admin",
                    githubUsername: ADMIN_USERNAME,
                },
            },
        }),
    ),
}));

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let retryPOST: typeof import("@/app/api/admin/sms/[smsId]/retry/route").POST;

function makeRequest(url: string, init?: RequestInit): NextRequest {
    return new Request(url, init) as unknown as NextRequest;
}

describe("SMS Retry - Route handler integration", () => {
    beforeAll(async () => {
        ({ POST: retryPOST } = await import("@/app/api/admin/sms/[smsId]/retry/route"));
    });

    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    async function callRetry(smsId: string) {
        return retryPOST(
            makeRequest(`http://localhost/api/admin/sms/${smsId}/retry`, {
                method: "POST",
            }),
            { params: Promise.resolve({ smsId }) },
        );
    }

    describe("Happy path", () => {
        it("should create a new queued SMS and auto-dismiss the original", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "Retry" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "failed",
                attempt_count: 3,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);
            expect(typeof payload.smsId).toBe("string");
            expect(payload.smsId).not.toBe(failedSms.id);

            // Original should be auto-dismissed
            const [original] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, failedSms.id));
            expect(original.dismissed_at).toBeInstanceOf(Date);
            expect(original.dismissed_by_user_id).toBe(ADMIN_USERNAME);

            // New SMS should be queued with same intent and text
            const [newSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, payload.smsId));
            expect(newSms.status).toBe("queued");
            expect(newSms.intent).toBe("pickup_reminder");
            expect(newSms.parcel_id).toBe(parcel.id);
            expect(newSms.household_id).toBe(household.id);
            expect(newSms.attempt_count).toBe(0);
        });

        it("should work for pickup_updated intent", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "Updated" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_updated",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);

            // Original should be auto-dismissed
            const [original] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, failedSms.id));
            expect(original.dismissed_at).toBeInstanceOf(Date);

            // New SMS should have correct intent
            const [newSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, payload.smsId));
            expect(newSms.intent).toBe("pickup_updated");
            expect(newSms.parcel_id).toBe(parcel.id);
        });

        it("should work for pickup_cancelled intent", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "Cancelled" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                deleted_at: new Date(), // Cancelled parcels are soft-deleted
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_cancelled",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);

            // Original should be auto-dismissed
            const [original] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, failedSms.id));
            expect(original.dismissed_at).toBeInstanceOf(Date);

            // New SMS should have correct intent
            const [newSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, payload.smsId));
            expect(newSms.intent).toBe("pickup_cancelled");
            expect(newSms.parcel_id).toBe(parcel.id);
        });
    });

    describe("Validation: non-retryable intent", () => {
        it("should reject enrolment intent even with a parcel_id", async () => {
            const household = await createTestHousehold({ first_name: "Enrol" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "enrolment",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(400);

            const payload = await response.json();
            expect(payload.code).toBe("INVALID_ACTION");
            expect(payload.error).toContain("intent is not retryable");
        });

        it("should reject food_parcels_ended intent even with a parcel_id", async () => {
            const household = await createTestHousehold({ first_name: "Ended" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "food_parcels_ended",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(400);

            const payload = await response.json();
            expect(payload.code).toBe("INVALID_ACTION");
            expect(payload.error).toContain("intent is not retryable");
        });
    });

    describe("Validation: pickup too late", () => {
        it("should reject when pickup is less than 1 hour away", async () => {
            const household = await createTestHousehold({ first_name: "TooLate" });
            const { location } = await createTestLocationWithSchedule();

            // Pickup 30 minutes from now
            const soonPickup = hoursFromTestNow(0.5);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: soonPickup,
                pickup_date_time_latest: new Date(soonPickup.getTime() + 30 * 60 * 1000),
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(400);

            const payload = await response.json();
            expect(payload.code).toBe("TOO_LATE");
        });

        it("should reject when pickup is in the past", async () => {
            const household = await createTestHousehold({ first_name: "Past" });
            const { location } = await createTestLocationWithSchedule();

            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(400);

            const payload = await response.json();
            expect(payload.code).toBe("TOO_LATE");
        });
    });

    describe("Validation: cooldown", () => {
        it("should reject when another SMS for same parcel was created within 5 minutes", async () => {
            const household = await createTestHousehold({ first_name: "Cooldown" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            // Recent SMS for same parcel (within 5 minutes)
            await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "queued",
                created_at: new Date(TEST_NOW.getTime() - 2 * 60 * 1000), // 2 minutes ago
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(429);

            const payload = await response.json();
            expect(payload.code).toBe("COOLDOWN_ACTIVE");
        });

        it("should allow retry when cooldown has passed", async () => {
            const household = await createTestHousehold({ first_name: "CooldownOk" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const failedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 10 * 60 * 1000), // 10 min ago
            });

            // Old SMS for same parcel (outside 5-minute window)
            await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "sent",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000), // 6 minutes ago
            });

            const response = await callRetry(failedSms.id);
            expect(response.status).toBe(200);
        });
    });

    describe("Validation: SMS state", () => {
        it("should reject SMS not in a failed state", async () => {
            const household = await createTestHousehold({ first_name: "NotFailed" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sentSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "sent",
                provider_status: "delivered",
                sent_at: new Date(TEST_NOW.getTime() - 60 * 1000),
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(sentSms.id);
            expect(response.status).toBe(400);

            const payload = await response.json();
            expect(payload.code).toBe("INVALID_ACTION");
        });

        it("should reject dismissed SMS", async () => {
            const household = await createTestHousehold({ first_name: "Dismissed" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const dismissedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                dismissed_at: new Date(),
                dismissed_by_user_id: "someone",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(dismissedSms.id);
            expect(response.status).toBe(400);

            const payload = await response.json();
            expect(payload.code).toBe("INVALID_ACTION");
        });

        it("should reject SMS without parcel_id", async () => {
            const household = await createTestHousehold({ first_name: "NoParcel" });

            const noParcelSms = await createTestSms({
                household_id: household.id,
                // No parcel_id
                intent: "pickup_reminder",
                status: "failed",
                attempt_count: 1,
                last_error_message: "Test error",
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(noParcelSms.id);
            expect(response.status).toBe(400);

            const payload = await response.json();
            expect(payload.code).toBe("INVALID_ACTION");
        });

        it("should allow retrying stale SMS (sent >24h ago with no callback)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "Stale" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const staleSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "sent",
                // No provider_status — never got a callback
                sent_at: new Date(TEST_NOW.getTime() - 25 * 60 * 60 * 1000), // 25h ago
                created_at: new Date(TEST_NOW.getTime() - 25 * 60 * 60 * 1000),
            });

            const response = await callRetry(staleSms.id);
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);

            // Original auto-dismissed
            const [original] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, staleSms.id));
            expect(original.dismissed_at).toBeInstanceOf(Date);
        });

        it("should allow retrying 'not delivered' SMS", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "NotDelivered" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const notDeliveredSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "sent",
                provider_status: "not delivered",
                sent_at: new Date(TEST_NOW.getTime() - 60 * 60 * 1000),
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(notDeliveredSms.id);
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);

            // Original auto-dismissed
            const [original] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, notDeliveredSms.id));
            expect(original.dismissed_at).toBeInstanceOf(Date);
        });

        it("should allow retrying provider-failed SMS (sent but provider rejected)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({ first_name: "ProviderFail" });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const providerFailedSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "sent",
                provider_status: "failed",
                sent_at: new Date(TEST_NOW.getTime() - 60 * 60 * 1000),
                created_at: new Date(TEST_NOW.getTime() - 6 * 60 * 1000),
            });

            const response = await callRetry(providerFailedSms.id);
            expect(response.status).toBe(200);

            const payload = await response.json();
            expect(payload.success).toBe(true);

            // Original auto-dismissed
            const [original] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, providerFailedSms.id));
            expect(original.dismissed_at).toBeInstanceOf(Date);
        });
    });

    describe("Validation: SMS not found", () => {
        it("should return 404 for non-existent SMS", async () => {
            const response = await callRetry("AbCdEfGhIjKlMnOp");
            expect(response.status).toBe(404);

            const payload = await response.json();
            expect(payload.code).toBe("NOT_FOUND");
        });

        it("should return 400 for invalid SMS ID format", async () => {
            const response = await callRetry("invalid!");
            expect(response.status).toBe(400);
        });
    });
});
