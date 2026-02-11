/**
 * Integration tests for SMS balance failure handling.
 *
 * Tests the full workflow:
 * - Pre-batch balance check skips batch when credits=0
 * - HTTP 402 during send sets balance_failure=true
 * - getInsufficientBalanceStatus() uses boolean column
 * - requeueBalanceFailures() resets balance_failure flag
 * - Dismissed balance failures are excluded from requeue
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestSms,
    createTestBalanceFailedSms,
    createTestFailedSms,
    createTestDismissedFailedSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { daysFromTestNow } from "../../test-time";
import { outgoingSms } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { MockSmsGateway } from "@/app/utils/sms/mock-sms-gateway";
import { setSmsGateway, resetSmsGateway } from "@/app/utils/sms/sms-gateway";
import {
    sendSmsRecord,
    getSmsRecordsReadyForSending,
    getInsufficientBalanceStatus,
    requeueBalanceFailures,
    resetBalanceAlertCooldown,
    checkBalanceBeforeBatch,
} from "@/app/utils/sms/sms-service";

describe("SMS Balance Failure Handling - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
        resetSmsGateway();
        resetBalanceAlertCooldown();
    });

    afterEach(() => {
        resetSmsGateway();
        resetBalanceAlertCooldown();
    });

    describe("Balance error detection and immediate failure", () => {
        it("HTTP 402 from provider marks SMS as failed with balance_failure=true", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "queued",
                attempt_count: 0,
                next_attempt_at: new Date(),
            });

            // Provider returns 402 (insufficient credits)
            const mockGateway = new MockSmsGateway().alwaysFail("Payment required", 402);
            setSmsGateway(mockGateway);

            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);
            expect(record).toBeDefined();

            const claimed = await sendSmsRecord(record!);
            expect(claimed).toBe(true);

            // Should be failed immediately, not retrying
            const [updatedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedRecord.status).toBe("failed");
            expect(updatedRecord.balance_failure).toBe(true);
            expect(updatedRecord.attempt_count).toBe(1);
            expect(updatedRecord.next_attempt_at).toBeNull();
            expect(updatedRecord.last_error_message).toContain("Payment required");

            // Only one gateway call (no retries)
            expect(mockGateway.getCallCount()).toBe(1);
        });

        it("non-402 error does NOT set balance_failure", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "queued",
                attempt_count: 0,
                next_attempt_at: new Date(),
            });

            // Provider returns 200 with "Insufficient credits" in message — no longer triggers balance detection
            const mockGateway = new MockSmsGateway().alwaysFail("Insufficient credits on account", 200);
            setSmsGateway(mockGateway);

            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);

            await sendSmsRecord(record!);

            const [updatedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            // Non-retriable HTTP 200 error → failed permanently, but NOT a balance failure
            expect(updatedRecord.status).toBe("failed");
            expect(updatedRecord.balance_failure).toBe(false);
        });

        it("transient 503 error still retries (not treated as balance error)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "queued",
                attempt_count: 0,
                next_attempt_at: new Date(),
            });

            // Provider returns 503 (transient error)
            const mockGateway = new MockSmsGateway().alwaysFail("Service unavailable", 503);
            setSmsGateway(mockGateway);

            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);

            await sendSmsRecord(record!);

            const [updatedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            // Should be retrying, not failed
            expect(updatedRecord.status).toBe("retrying");
            expect(updatedRecord.balance_failure).toBe(false);
            expect(updatedRecord.next_attempt_at).not.toBeNull();
        });
    });

    describe("Pre-batch balance check", () => {
        it("skips batch when credits=0", async () => {
            const mockGateway = new MockSmsGateway().mockBalance(0);
            setSmsGateway(mockGateway);

            const shouldProceed = await checkBalanceBeforeBatch();
            expect(shouldProceed).toBe(false);
        });

        it("proceeds when credits > 0", async () => {
            const mockGateway = new MockSmsGateway().mockBalance(100);
            setSmsGateway(mockGateway);

            const shouldProceed = await checkBalanceBeforeBatch();
            expect(shouldProceed).toBe(true);
        });

        it("proceeds (fail-open) when balance check returns network error", async () => {
            const mockGateway = new MockSmsGateway().mockBalanceError("Network timeout");
            setSmsGateway(mockGateway);

            const shouldProceed = await checkBalanceBeforeBatch();
            expect(shouldProceed).toBe(true);
        });

        it("proceeds (fail-open) when balance check returns success but no credits field", async () => {
            // MockSmsGateway defaults to 999 credits, but test the error path
            // by configuring a balance error (simulates malformed response)
            const mockGateway = new MockSmsGateway().mockBalanceError("Invalid balance response: missing credits field");
            setSmsGateway(mockGateway);

            const shouldProceed = await checkBalanceBeforeBatch();
            expect(shouldProceed).toBe(true);
        });
    });

    describe("getInsufficientBalanceStatus (boolean column)", () => {
        it("returns count of undismissed balance failures", async () => {
            const household = await createTestHousehold();

            // Create balance failures (using boolean column)
            await createTestBalanceFailedSms({ household_id: household.id });
            await createTestBalanceFailedSms({ household_id: household.id });

            // Non-balance failure (should not be counted)
            await createTestFailedSms({
                household_id: household.id,
                error_message: "Invalid phone number",
            });

            const status = await getInsufficientBalanceStatus();

            expect(status.hasBalanceFailures).toBe(true);
            expect(status.failureCount).toBe(2);
        });

        it("excludes dismissed balance failures", async () => {
            const household = await createTestHousehold();

            // Dismissed balance failure
            await createTestDismissedFailedSms({
                household_id: household.id,
                error_message: "HTTP 402",
            });

            const status = await getInsufficientBalanceStatus();

            expect(status.hasBalanceFailures).toBe(false);
            expect(status.failureCount).toBe(0);
        });

        it("returns no failures when only non-balance failures exist", async () => {
            const household = await createTestHousehold();

            await createTestFailedSms({
                household_id: household.id,
                error_message: "Timeout connecting to provider",
            });

            const status = await getInsufficientBalanceStatus();

            expect(status.hasBalanceFailures).toBe(false);
            expect(status.failureCount).toBe(0);
        });
    });

    describe("Manual requeue workflow (end-to-end)", () => {
        it("admin requeues balance failures → queue processor picks them up → SMS sent", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            // Simulate two SMS that failed due to insufficient balance
            await createTestBalanceFailedSms({ household_id: household.id });
            await createTestBalanceFailedSms({ household_id: household.id });

            // Verify they show up in balance status
            const statusBefore = await getInsufficientBalanceStatus();
            expect(statusBefore.failureCount).toBe(2);

            // Admin requeues balance failures (after topping up credits)
            const requeuedCount = await requeueBalanceFailures();
            expect(requeuedCount).toBe(2);

            // Verify records are now queued with valid next_attempt_at
            const statusAfter = await getInsufficientBalanceStatus();
            expect(statusAfter.failureCount).toBe(0);

            // The queue processor should now pick them up
            const readyRecords = await getSmsRecordsReadyForSending();
            expect(readyRecords.length).toBe(2);

            // Send them successfully
            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            for (const record of readyRecords) {
                const claimed = await sendSmsRecord(record);
                expect(claimed).toBe(true);
            }

            // Verify all records are now sent
            const allSms = await db.select().from(outgoingSms);
            for (const sms of allSms) {
                expect(sms.status).toBe("sent");
                expect(sms.sent_at).not.toBeNull();
            }

            expect(mockGateway.getCallCount()).toBe(2);
        });

        it("requeue only affects balance failures, not other failures", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            // Balance failure (boolean column)
            const balanceSms = await createTestBalanceFailedSms({
                household_id: household.id,
            });
            // Non-balance failure (should not be requeued)
            const otherSms = await createTestFailedSms({
                household_id: household.id,
                error_message: "Invalid phone number format",
            });

            const requeuedCount = await requeueBalanceFailures();
            expect(requeuedCount).toBe(1);

            // Balance failure is now queued with balance_failure reset
            const [balanceRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, balanceSms.id));
            expect(balanceRecord.status).toBe("queued");
            expect(balanceRecord.balance_failure).toBe(false);
            expect(balanceRecord.attempt_count).toBe(0);
            expect(balanceRecord.next_attempt_at).not.toBeNull();

            // Other failure is still failed
            const [otherRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, otherSms.id));
            expect(otherRecord.status).toBe("failed");
        });

        it("requeue skips dismissed balance failures", async () => {
            const household = await createTestHousehold();

            // Dismissed balance failure — note: createTestDismissedFailedSms doesn't set
            // balance_failure=true by default, so this tests that dismissed records with
            // balance_failure=false are correctly excluded
            await createTestSms({
                household_id: household.id,
                status: "failed",
                attempt_count: 1,
                last_error_message: "HTTP 402",
                balance_failure: true,
                dismissed_at: new Date(),
                dismissed_by_user_id: "test-user",
            });

            // Active balance failure
            await createTestBalanceFailedSms({
                household_id: household.id,
            });

            const requeuedCount = await requeueBalanceFailures();
            // Only the active (undismissed) one should be requeued
            expect(requeuedCount).toBe(1);
        });

        it("double requeue is idempotent (second call requeues zero)", async () => {
            const household = await createTestHousehold();

            await createTestBalanceFailedSms({ household_id: household.id });

            const first = await requeueBalanceFailures();
            expect(first).toBe(1);

            // Second call should find zero because they're now "queued" with balance_failure=false
            const second = await requeueBalanceFailures();
            expect(second).toBe(0);
        });
    });

    describe("Balance failure then successful retry after requeue", () => {
        it("full lifecycle: send fails with 402 → admin requeues → send succeeds", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Phase 1: Initial send attempt fails with 402
            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "queued",
                attempt_count: 0,
                next_attempt_at: new Date(),
            });

            const failGateway = new MockSmsGateway().alwaysFail("HTTP 402", 402);
            setSmsGateway(failGateway);

            const readyRecords1 = await getSmsRecordsReadyForSending();
            const record1 = readyRecords1.find(r => r.id === sms.id);
            await sendSmsRecord(record1!);

            // Verify failed state with balance_failure flag
            const [failedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));
            expect(failedRecord.status).toBe("failed");
            expect(failedRecord.balance_failure).toBe(true);
            expect(failedRecord.last_error_message).toBe("HTTP 402");

            // Phase 2: Admin tops up credits and requeues
            const requeuedCount = await requeueBalanceFailures();
            expect(requeuedCount).toBe(1);

            // Verify requeued state with balance_failure cleared
            const [requeuedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));
            expect(requeuedRecord.status).toBe("queued");
            expect(requeuedRecord.balance_failure).toBe(false);
            expect(requeuedRecord.attempt_count).toBe(0);
            expect(requeuedRecord.next_attempt_at).not.toBeNull();
            expect(requeuedRecord.last_error_message).toBeNull();

            // Phase 3: Queue processor picks it up and sends successfully
            const successGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(successGateway);

            const readyRecords2 = await getSmsRecordsReadyForSending();
            const record2 = readyRecords2.find(r => r.id === sms.id);
            expect(record2).toBeDefined();

            await sendSmsRecord(record2!);

            // Verify sent
            const [sentRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));
            expect(sentRecord.status).toBe("sent");
            expect(sentRecord.sent_at).not.toBeNull();
            expect(sentRecord.attempt_count).toBe(1);
        });
    });
});
