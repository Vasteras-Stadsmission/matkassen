/**
 * Integration tests for SMS balance failure handling.
 *
 * Tests the full workflow:
 * - Pre-batch balance check returns credit count (or null for fail-open)
 * - Credit budget: credits=0 → fail-fast all as balance failures
 * - Credit budget: credits=N → send N, fail-fast the rest
 * - getInsufficientBalanceStatus() uses boolean column
 * - requeueBalanceFailures() resets balance_failure flag
 * - Dismissed balance failures are excluded from requeue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestSms,
    createTestBalanceFailedSms,
    createTestFailedSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { daysFromTestNow } from "../../test-time";

// All 7 days so tests work regardless of which weekday TEST_NOW falls on
const ALL_WEEKDAYS = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
] as const;
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
    getAvailableCredits,
    processRemindersJIT,
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

    describe("Send failure handling", () => {
        it("transient 503 error retries normally (not a balance failure)", async () => {
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

    describe("Pre-batch balance check (getAvailableCredits)", () => {
        it("returns 0 when credits=0", async () => {
            const mockGateway = new MockSmsGateway().mockBalance(0);
            setSmsGateway(mockGateway);

            const credits = await getAvailableCredits();
            expect(credits).toBe(0);
        });

        it("returns credit count when credits > 0", async () => {
            const mockGateway = new MockSmsGateway().mockBalance(100);
            setSmsGateway(mockGateway);

            const credits = await getAvailableCredits();
            expect(credits).toBe(100);
        });

        it("returns null (fail-open) when balance check returns network error", async () => {
            const mockGateway = new MockSmsGateway().mockBalanceError("Network timeout");
            setSmsGateway(mockGateway);

            const credits = await getAvailableCredits();
            expect(credits).toBeNull();
        });

        it("returns null (fail-open) when balance check returns malformed response", async () => {
            const mockGateway = new MockSmsGateway().mockBalanceError(
                "Invalid balance response: missing credits field",
            );
            setSmsGateway(mockGateway);

            const credits = await getAvailableCredits();
            expect(credits).toBeNull();
        });
    });

    describe("Credit budget: fail-fast when credits exhausted", () => {
        it("credits=0 fail-fasts all eligible parcels as balance failures", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: [...ALL_WEEKDAYS] },
            );

            // Create two eligible parcels
            const tomorrow = daysFromTestNow(1);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            });

            const household2 = await createTestHousehold();
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            });

            // Gateway should never be called
            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // Process with creditBudget=0
            const result = await processRemindersJIT(0);

            expect(result.sent).toBe(0);
            expect(result.failedForBalance).toBe(2);
            expect(result.processed).toBe(2);

            // Gateway was never called
            expect(mockGateway.getCallCount()).toBe(0);

            // Both records should be failed with balance_failure=true
            const allSms = await db.select().from(outgoingSms);
            expect(allSms.length).toBe(2);
            for (const sms of allSms) {
                expect(sms.status).toBe("failed");
                expect(sms.balance_failure).toBe(true);
                expect(sms.last_error_message).toBe("Insufficient SMS credits");
            }
        });

        it("credits=1 sends first SMS and fail-fasts the rest", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: [...ALL_WEEKDAYS] },
            );

            const tomorrow = daysFromTestNow(1);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            });

            const household2 = await createTestHousehold();
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // processRemindersJIT uses setTimeout(1000) between sends.
            // Integration tests run with vi.useFakeTimers(), so we must
            // advance fake timers to unblock the delays.
            const promise = processRemindersJIT(1);
            await vi.runAllTimersAsync();
            const result = await promise;

            expect(result.sent).toBe(1);
            expect(result.failedForBalance).toBe(1);
            expect(result.processed).toBe(2);

            // Gateway called exactly once
            expect(mockGateway.getCallCount()).toBe(1);

            // One sent, one failed for balance
            const allSms = await db.select().from(outgoingSms);
            const sentSms = allSms.filter(s => s.status === "sent");
            const failedSms = allSms.filter(s => s.status === "failed");
            expect(sentSms.length).toBe(1);
            expect(failedSms.length).toBe(1);
            expect(failedSms[0].balance_failure).toBe(true);
        });

        it("credits=undefined (fail-open) sends all SMS without limit", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: [...ALL_WEEKDAYS] },
            );

            const tomorrow = daysFromTestNow(1);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            });

            const household2 = await createTestHousehold();
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // Advance fake timers to unblock setTimeout delays in processRemindersJIT
            const promise = processRemindersJIT(undefined);
            await vi.runAllTimersAsync();
            const result = await promise;

            expect(result.sent).toBe(2);
            expect(result.failedForBalance).toBe(0);
            expect(mockGateway.getCallCount()).toBe(2);
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

            // Balance failure that has been dismissed — must set both flags
            // to verify the dismissed_at filter (not just balance_failure=false)
            await createTestSms({
                household_id: household.id,
                status: "failed",
                attempt_count: 1,
                last_error_message: "Insufficient balance",
                balance_failure: true,
                dismissed_at: new Date(),
                dismissed_by_user_id: "test-admin",
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

            // Dismissed balance failure
            await createTestSms({
                household_id: household.id,
                status: "failed",
                attempt_count: 1,
                last_error_message: "Insufficient balance",
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

    describe("Fail-fast lifecycle: balance=0 → fail-fast → requeue → send", () => {
        it("fail-fasted SMS can be requeued and sent after credits restored", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: [...ALL_WEEKDAYS] },
            );

            const tomorrow = daysFromTestNow(1);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000),
            });

            // Phase 1: Fail-fast with creditBudget=0
            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            const result = await processRemindersJIT(0);
            expect(result.failedForBalance).toBe(1);
            expect(mockGateway.getCallCount()).toBe(0);

            // Record exists as failed balance failure
            const statusBefore = await getInsufficientBalanceStatus();
            expect(statusBefore.failureCount).toBe(1);

            // Phase 2: Admin requeues
            const requeuedCount = await requeueBalanceFailures();
            expect(requeuedCount).toBe(1);

            // Phase 3: Send succeeds
            const readyRecords = await getSmsRecordsReadyForSending();
            expect(readyRecords.length).toBe(1);

            for (const record of readyRecords) {
                await sendSmsRecord(record);
            }

            const allSms = await db.select().from(outgoingSms);
            expect(allSms.length).toBe(1);
            expect(allSms[0].status).toBe("sent");
            expect(allSms[0].balance_failure).toBe(false); // Cleared by requeue
        });
    });
});
