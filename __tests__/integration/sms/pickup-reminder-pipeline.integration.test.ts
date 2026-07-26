/**
 * Integration tests for pickup reminder SMS send pipeline.
 *
 * Tests the sendReminderForParcel function with MockSmsGateway
 * to verify success, idempotency, retry, and failure scenarios.
 *
 * IMPORTANT: Uses shared TEST_NOW for deterministic testing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestPickedUpParcel,
    createTestDeletedParcel,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow, hoursFromTestNow } from "../../test-time";
import { outgoingSms, households, foodParcels } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { MockSmsGateway } from "@/app/utils/sms/mock-sms-gateway";
import { setSmsGateway, resetSmsGateway } from "@/app/utils/sms/sms-gateway";
import {
    sendReminderForParcel,
    sendSmsRecord,
    getSmsRecordsReadyForSending,
} from "@/app/utils/sms/sms-service";
import { logger } from "@/app/utils/logger";

describe("Pickup Reminder SMS Pipeline - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
        resetSmsGateway();
    });

    afterEach(() => {
        resetSmsGateway();
        vi.restoreAllMocks();
    });

    describe("Success Scenarios", () => {
        it("creates record and sends successfully with provider_message_id set", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            // Future parcel (tomorrow)
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Use mock gateway for deterministic testing
            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result.success).toBe(true);
            expect(result.recordId).toBeDefined();

            // Verify SMS record in database
            const [smsRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result.recordId!));

            expect(smsRecord.intent).toBe("pickup_reminder");
            expect(smsRecord.parcel_id).toBe(parcel.id);
            expect(smsRecord.household_id).toBe(household.id);
            expect(smsRecord.to_e164).toBe("+46701234567");
            expect(smsRecord.status).toBe("sent");
            expect(smsRecord.provider_message_id).toBe("mock_1");
            expect(smsRecord.sent_at).not.toBeNull();

            // Verify mock was called
            expect(mockGateway.getCallCount()).toBe(1);
            const lastCall = mockGateway.getLastCall();
            expect(lastCall?.request.to).toBe("+46701234567");
            expect(lastCall?.request.text).toContain("Matpaket");
        });

        it("refreshes SMS text when pickup time changed after eligibility lookup", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "en",
            });
            const { location } = await createTestLocationWithSchedule();

            const originalPickup = daysFromTestNow(1);
            const rescheduledPickup = new Date(originalPickup.getTime() + 2 * 60 * 60 * 1000);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: originalPickup,
                pickup_date_time_latest: new Date(originalPickup.getTime() + 30 * 60 * 1000),
            });

            await db
                .update(foodParcels)
                .set({
                    pickup_date_time_earliest: rescheduledPickup,
                    pickup_date_time_latest: new Date(rescheduledPickup.getTime() + 30 * 60 * 1000),
                })
                .where(eq(foodParcels.id, parcel.id));

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "en",
                pickupDate: originalPickup,
            });

            expect(result.success).toBe(true);

            const sentText = mockGateway.getLastCall()?.request.text;
            expect(sentText).toContain("14:00");
            expect(sentText).not.toContain("12:00");

            const [smsRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result.recordId!));

            expect(smsRecord.text).toBe(sentText);
        });
    });

    describe("Idempotency", () => {
        it("second call creates no duplicate record", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // First call creates the record
            const result1 = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result1.success).toBe(true);
            expect(result1.recordId).toBeDefined();
            expect(mockGateway.getCallCount()).toBe(1);

            // Second call should be deduplicated (no new record, no send)
            const result2 = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result2.success).toBe(true);
            expect(result2.recordId).toBeUndefined(); // No new record created

            // Mock should NOT be called again
            expect(mockGateway.getCallCount()).toBe(1);

            // Verify only one SMS record exists
            const allRecords = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.parcel_id, parcel.id));
            expect(allRecords).toHaveLength(1);
        });
    });

    describe("Retry Behavior", () => {
        it("retriable failure (503) sets status to retrying with backoff", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Mock gateway that fails with retriable error
            const mockGateway = new MockSmsGateway().alwaysFail("Service unavailable", 503);
            setSmsGateway(mockGateway);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result.success).toBe(false);
            expect(result.recordId).toBeDefined();
            expect(result.error).toContain("unavailable");

            // Verify SMS record is in retrying state
            const [smsRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result.recordId!));

            expect(smsRecord.status).toBe("retrying");
            expect(smsRecord.last_error_message).toContain("unavailable");
            expect(smsRecord.next_attempt_at).not.toBeNull();
            expect(smsRecord.attempt_count).toBe(1);
        });

        it("does not log sensitive data when the provider throws", async () => {
            const phone = "+46709990010";
            const smsBody = "SENTINEL_THROWN_PROVIDER_SMS_BODY";
            const providerError =
                `SENTINEL_THROWN_PROVIDER_ERROR phone=${phone} body=${smsBody} ` +
                "credential=SENTINEL_THROWN_PROVIDER_CREDENTIAL";
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: phone,
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });
            const mockGateway = new MockSmsGateway();
            vi.spyOn(mockGateway, "send").mockRejectedValue(new Error(providerError));
            setSmsGateway(mockGateway);
            const errorLogSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone,
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result).toMatchObject({
                success: false,
                error: providerError,
            });
            const [smsRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result.recordId!));
            expect(smsRecord.status).toBe("retrying");
            expect(smsRecord.last_error_message).toBe(providerError);

            const logged = JSON.stringify(errorLogSpy.mock.calls);
            expect(logged).not.toContain(phone);
            expect(logged).not.toContain(smsBody);
            expect(logged).not.toContain(providerError);
            expect(logged).not.toContain("SENTINEL_THROWN_PROVIDER_CREDENTIAL");
            expect(errorLogSpy).toHaveBeenCalledWith(
                {
                    smsId: result.recordId,
                    parcelId: parcel.id,
                },
                "SMS provider request failed unexpectedly (JIT)",
            );
        });

        it("does not log the provider message ID when persisting success fails", async () => {
            const phone = "+46709990013";
            const providerMessageId =
                "SENTINEL_PROVIDER_MESSAGE_ID_AFTER_SUCCESS_phone_46709990013_body_secret";
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: phone,
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();
            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });
            const mockGateway = new MockSmsGateway();
            vi.spyOn(mockGateway, "send").mockResolvedValue({
                success: true,
                messageId: providerMessageId,
            });
            setSmsGateway(mockGateway);
            const errorLogSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone,
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result).toMatchObject({
                success: false,
                recordId: expect.any(String),
            });
            expect(result.error).toContain(providerMessageId);

            const [smsRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result.recordId!));
            expect(smsRecord.status).toBe("retrying");
            expect(smsRecord.last_error_message).toContain(providerMessageId);

            const logged = JSON.stringify(errorLogSpy.mock.calls);
            expect(logged).not.toContain(providerMessageId);
            expect(logged).not.toContain(phone);
            expect(logged).not.toContain("body_secret");
            expect(errorLogSpy).toHaveBeenCalledWith(
                {
                    smsId: result.recordId,
                    parcelId: parcel.id,
                },
                "Failed to persist sent SMS status (JIT)",
            );
        });

        it("retry via sendSmsRecord succeeds after initial failure", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // First attempt fails with 503
            const mockGateway = new MockSmsGateway().failThenSucceed(1, "Service unavailable", 503);
            setSmsGateway(mockGateway);

            const result1 = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result1.success).toBe(false);
            expect(mockGateway.getCallCount()).toBe(1);

            // Verify it's in retrying state
            const [record1] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result1.recordId!));
            expect(record1.status).toBe("retrying");

            // Simulate retry by updating next_attempt_at to now
            await db
                .update(outgoingSms)
                .set({ next_attempt_at: new Date() })
                .where(eq(outgoingSms.id, result1.recordId!));

            // Get the record ready for retry
            const readyRecords = await getSmsRecordsReadyForSending();
            const recordToRetry = readyRecords.find(r => r.id === result1.recordId);
            expect(recordToRetry).toBeDefined();

            // Retry succeeds (mock will succeed on 2nd call)
            const retrySuccess = await sendSmsRecord(recordToRetry!);
            expect(retrySuccess).toBe(true);
            expect(mockGateway.getCallCount()).toBe(2);

            // Verify it's now sent
            const [record2] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result1.recordId!));
            expect(record2.status).toBe("sent");
            expect(record2.provider_message_id).toBe("mock_1");
        });
    });

    describe("Permanent Failure", () => {
        it("non-retriable error (400) sets status to failed immediately", async () => {
            const phone = "+46709990002";
            const providerError =
                "SENTINEL_PROVIDER_ERROR_JIT credential=SENTINEL_CREDENTIAL_JIT " +
                `phone=${phone}`;
            const errorLogSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: phone,
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            // Mock gateway that fails with permanent error
            const mockGateway = new MockSmsGateway().alwaysFail(providerError, 400);
            setSmsGateway(mockGateway);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone,
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result.success).toBe(false);
            expect(result.recordId).toBeDefined();

            // Verify SMS record is in failed state (not retrying)
            const [smsRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result.recordId!));

            expect(smsRecord.status).toBe("failed");
            expect(smsRecord.last_error_message).toBe(providerError);
            expect(smsRecord.next_attempt_at).toBeNull();

            // Mock was called only once (no retry)
            expect(mockGateway.getCallCount()).toBe(1);

            const logged = JSON.stringify(errorLogSpy.mock.calls);
            expect(logged).not.toContain(phone);
            expect(logged).not.toContain(providerError);
            expect(logged).not.toContain("SENTINEL_CREDENTIAL_JIT");
            expect(errorLogSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    smsId: result.recordId,
                    parcelId: parcel.id,
                    providerHttpStatus: 400,
                }),
                "SMS failed permanently (JIT)",
            );
        });
    });

    describe("Pickup Time Passed", () => {
        it("cancels SMS when pickup time has passed", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            // Parcel with pickup time in the past
            const yesterday = daysFromTestNow(-1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: yesterday,
            });

            expect(result.success).toBe(false);
            expect(result.recordId).toBeDefined();
            expect(result.error).toContain("no longer eligible");

            // Verify SMS record is cancelled
            const [smsRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, result.recordId!));

            expect(smsRecord.status).toBe("cancelled");

            // Mock should NOT be called (cancelled before send)
            expect(mockGateway.getCallCount()).toBe(0);
        });
    });

    describe("Eligibility Checks", () => {
        it("cancels SMS when parcel is already picked up", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-1),
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("no longer eligible");

            // Mock should NOT be called
            expect(mockGateway.getCallCount()).toBe(0);
        });

        it("cancels SMS when parcel is deleted", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestDeletedParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("no longer eligible");

            // Mock should NOT be called
            expect(mockGateway.getCallCount()).toBe(0);
        });

        it("cancels SMS when household is anonymized", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            // Mark household as anonymized
            await db
                .update(households)
                .set({ anonymized_at: new Date() })
                .where(eq(households.id, household.id));

            const tomorrow = daysFromTestNow(1);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            const result = await sendReminderForParcel({
                parcelId: parcel.id,
                householdId: household.id,
                phone: "+46701234567",
                locale: "sv",
                pickupDate: tomorrow,
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain("no longer eligible");

            // Mock should NOT be called
            expect(mockGateway.getCallCount()).toBe(0);
        });
    });
});
