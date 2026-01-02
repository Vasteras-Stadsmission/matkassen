/**
 * Integration tests for SMS queue processing (sendSmsRecord).
 *
 * Tests the core queue processor with MockSmsGateway to verify:
 * - Successful sending increments attempt_count
 * - Transient errors schedule retry with backoff
 * - Max attempts stops retrying
 * - Claim behavior prevents duplicate sends
 *
 * IMPORTANT: Uses shared TEST_NOW for deterministic testing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
import { daysFromTestNow } from "../../test-time";
import { outgoingSms } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { MockSmsGateway } from "@/app/utils/sms/mock-sms-gateway";
import { setSmsGateway, resetSmsGateway } from "@/app/utils/sms/sms-gateway";
import { sendSmsRecord, getSmsRecordsReadyForSending } from "@/app/utils/sms/sms-service";

describe("SMS Queue Processing (sendSmsRecord) - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
        resetSmsGateway();
    });

    afterEach(() => {
        resetSmsGateway();
    });

    describe("Successful Send", () => {
        it("queued record sends successfully and increments attempt_count", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Create queued SMS record (ready for sending now)
            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "queued",
                attempt_count: 0,
                next_attempt_at: new Date(), // Ready for sending now
            });

            // Use mock gateway
            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // Get record and send it
            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);
            expect(record).toBeDefined();

            const success = await sendSmsRecord(record!);
            expect(success).toBe(true);

            // Verify record is now sent
            const [updatedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedRecord.status).toBe("sent");
            expect(updatedRecord.attempt_count).toBe(1);
            expect(updatedRecord.provider_message_id).toBe("mock_1");
            expect(updatedRecord.sent_at).not.toBeNull();
            expect(updatedRecord.last_error_message).toBeNull();

            // Verify mock was called
            expect(mockGateway.getCallCount()).toBe(1);
        });

        it("retrying record sends successfully on retry", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Create retrying SMS record (already had 1 attempt)
            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "retrying",
                attempt_count: 1,
                next_attempt_at: new Date(), // Ready for retry now
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);
            expect(record).toBeDefined();

            const success = await sendSmsRecord(record!);
            expect(success).toBe(true);

            // Verify record is now sent with incremented attempt count
            const [updatedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedRecord.status).toBe("sent");
            expect(updatedRecord.attempt_count).toBe(2);
        });
    });

    describe("Transient Error Handling", () => {
        it("schedules retry with next_attempt_at on transient error", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
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
                next_attempt_at: new Date(), // Ready for sending now
            });

            // Mock gateway that fails with transient error
            const mockGateway = new MockSmsGateway().alwaysFail("Service unavailable", 503);
            setSmsGateway(mockGateway);

            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);

            // sendSmsRecord returns true when record is claimed and processed
            // (regardless of whether send succeeded or failed)
            const claimed = await sendSmsRecord(record!);
            expect(claimed).toBe(true);

            // Verify record is in retrying state with backoff set
            const [updatedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedRecord.status).toBe("retrying");
            expect(updatedRecord.attempt_count).toBe(1);
            expect(updatedRecord.next_attempt_at).not.toBeNull();
            expect(updatedRecord.last_error_message).toContain("unavailable");
        });

        it("uses 5-minute backoff for first retry, 30-minute for subsequent", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // First attempt (attempt_count = 0)
            const sms1 = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "queued",
                attempt_count: 0,
                next_attempt_at: new Date(), // Ready for sending now
            });

            const mockGateway = new MockSmsGateway().alwaysFail("Error", 503);
            setSmsGateway(mockGateway);

            const records1 = await getSmsRecordsReadyForSending();
            const record1 = records1.find(r => r.id === sms1.id);
            await sendSmsRecord(record1!);

            const [after1] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms1.id));

            // First retry should be ~5 minutes from now
            const fiveMinutesMs = 5 * 60 * 1000;
            const timeDiff1 = after1.next_attempt_at!.getTime() - after1.created_at.getTime();
            expect(timeDiff1).toBeGreaterThanOrEqual(fiveMinutesMs - 1000);
            expect(timeDiff1).toBeLessThanOrEqual(fiveMinutesMs + 60000);

            // Second attempt (simulate retry)
            await db
                .update(outgoingSms)
                .set({ next_attempt_at: new Date() })
                .where(eq(outgoingSms.id, sms1.id));

            const records2 = await getSmsRecordsReadyForSending();
            const record2 = records2.find(r => r.id === sms1.id);
            const before2ndAttempt = new Date();
            await sendSmsRecord(record2!);

            const [after2] = await db.select().from(outgoingSms).where(eq(outgoingSms.id, sms1.id));

            // Second retry should be ~30 minutes from now
            const thirtyMinutesMs = 30 * 60 * 1000;
            const timeDiff2 = after2.next_attempt_at!.getTime() - before2ndAttempt.getTime();
            expect(timeDiff2).toBeGreaterThanOrEqual(thirtyMinutesMs - 1000);
            expect(timeDiff2).toBeLessThanOrEqual(thirtyMinutesMs + 60000);
        });
    });

    describe("Max Attempts", () => {
        it("stops retrying and marks failed after max attempts (3)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Already at 2 attempts (3rd attempt will be final)
            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                status: "retrying",
                attempt_count: 2,
                next_attempt_at: new Date(),
            });

            const mockGateway = new MockSmsGateway().alwaysFail("Still failing", 503);
            setSmsGateway(mockGateway);

            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);

            // sendSmsRecord returns true when record is claimed and processed
            const claimed = await sendSmsRecord(record!);
            expect(claimed).toBe(true);

            // Verify record is now failed (not retrying)
            const [updatedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedRecord.status).toBe("failed");
            expect(updatedRecord.attempt_count).toBe(3);
            expect(updatedRecord.next_attempt_at).toBeNull(); // No more retries
        });
    });

    describe("Claim Behavior", () => {
        it("second send attempt on same record returns false (already claimed)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
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
                next_attempt_at: new Date(), // Ready for sending now
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // Get the record
            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);
            expect(record).toBeDefined();

            // First send succeeds
            const success1 = await sendSmsRecord(record!);
            expect(success1).toBe(true);
            expect(mockGateway.getCallCount()).toBe(1);

            // Second send with same stale record returns false (already sent)
            const success2 = await sendSmsRecord(record!);
            expect(success2).toBe(false);

            // Mock should NOT be called again
            expect(mockGateway.getCallCount()).toBe(1);
        });

        it("does not send if record status changed between fetch and claim", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
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
                next_attempt_at: new Date(), // Ready for sending now
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // Get the record
            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);

            // Simulate another process claiming the record (change status)
            await db
                .update(outgoingSms)
                .set({ status: "sending" })
                .where(eq(outgoingSms.id, sms.id));

            // Send should fail because claim will not succeed
            const success = await sendSmsRecord(record!);
            expect(success).toBe(false);

            // Mock should NOT be called
            expect(mockGateway.getCallCount()).toBe(0);
        });
    });

    describe("Permanent Error Handling", () => {
        it("marks as failed immediately for 400 error", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
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
                next_attempt_at: new Date(), // Ready for sending now
            });

            // Mock gateway that fails with permanent error (400)
            const mockGateway = new MockSmsGateway().alwaysFail("Bad request", 400);
            setSmsGateway(mockGateway);

            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === sms.id);

            // sendSmsRecord returns true when record is claimed and processed
            const claimed = await sendSmsRecord(record!);
            expect(claimed).toBe(true);

            // Verify record is failed (not retrying)
            const [updatedRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedRecord.status).toBe("failed");
            expect(updatedRecord.attempt_count).toBe(1);
            expect(updatedRecord.next_attempt_at).toBeNull();
        });
    });
});
