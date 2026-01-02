/**
 * Integration tests for pickup_updated SMS functionality.
 *
 * Tests the complete flow: parcel is rescheduled after reminder was sent → update SMS is queued.
 * Verifies the behavior matches real use cases, not implementation details.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestSentSms,
    createTestQueuedSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { daysFromTestNow } from "../../test-time";
import { outgoingSms } from "@/app/db/schema";
import { eq, and } from "drizzle-orm";
import {
    queuePickupUpdatedSms,
    getSmsRecordsReadyForSending,
    sendSmsRecord,
} from "@/app/utils/sms/sms-service";
import { MockSmsGateway } from "@/app/utils/sms/mock-sms-gateway";
import { setSmsGateway } from "@/app/utils/sms/sms-gateway";

describe("Pickup Updated SMS - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Parcel rescheduled after reminder was sent", () => {
        it("should queue update SMS when reminder was already sent", async () => {
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

            // Reminder was already sent
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // Admin reschedules parcel to different date
            // This triggers queuePickupUpdatedSms
            const result = await queuePickupUpdatedSms(parcel.id);

            // Verify result
            expect(result.success).toBe(true);
            expect(result.skipped).toBeFalsy();
            expect(result.recordId).toBeDefined();

            // Verify pickup_updated SMS was queued
            const updateSms = await db
                .select()
                .from(outgoingSms)
                .where(
                    and(
                        eq(outgoingSms.parcel_id, parcel.id),
                        eq(outgoingSms.intent, "pickup_updated"),
                    ),
                );

            expect(updateSms).toHaveLength(1);
            expect(updateSms[0].status).toBe("queued");
            expect(updateSms[0].household_id).toBe(household.id);
        });
    });

    describe("Parcel rescheduled before any reminder was sent", () => {
        it("should NOT queue update SMS when no reminder was sent", async () => {
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

            // No reminder exists yet - parcel was just created

            // Admin reschedules parcel before reminder was sent
            const result = await queuePickupUpdatedSms(parcel.id);

            // Verify result - should be skipped
            expect(result.success).toBe(true);
            expect(result.skipped).toBe(true);
            expect(result.reason).toBe("No sent pickup_reminder exists for this parcel");

            // Verify NO pickup_updated SMS was created
            const updateSms = await db
                .select()
                .from(outgoingSms)
                .where(
                    and(
                        eq(outgoingSms.parcel_id, parcel.id),
                        eq(outgoingSms.intent, "pickup_updated"),
                    ),
                );

            expect(updateSms).toHaveLength(0);
        });

        it("should NOT queue update SMS when reminder is still queued", async () => {
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

            // Reminder was queued but not sent yet
            await createTestQueuedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // Admin reschedules parcel while reminder is still queued
            const result = await queuePickupUpdatedSms(parcel.id);

            // Verify result - should be skipped (only sent reminders trigger updates)
            expect(result.success).toBe(true);
            expect(result.skipped).toBe(true);

            // Verify NO pickup_updated SMS was created
            const updateSms = await db
                .select()
                .from(outgoingSms)
                .where(
                    and(
                        eq(outgoingSms.parcel_id, parcel.id),
                        eq(outgoingSms.intent, "pickup_updated"),
                    ),
                );

            expect(updateSms).toHaveLength(0);
        });
    });

    describe("Parcel rescheduled multiple times after reminder", () => {
        it("should only create one update SMS due to idempotency", async () => {
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

            // Reminder was already sent
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // First reschedule
            const result1 = await queuePickupUpdatedSms(parcel.id);
            expect(result1.success).toBe(true);
            expect(result1.skipped).toBeFalsy();
            const firstSmsId = result1.recordId;

            // Second reschedule (admin changes mind again)
            const result2 = await queuePickupUpdatedSms(parcel.id);
            expect(result2.success).toBe(true);
            // Second call should return same record due to idempotency
            expect(result2.recordId).toBe(firstSmsId);

            // Third reschedule
            const result3 = await queuePickupUpdatedSms(parcel.id);
            expect(result3.success).toBe(true);
            expect(result3.recordId).toBe(firstSmsId);

            // Verify only ONE pickup_updated SMS exists
            const updateSms = await db
                .select()
                .from(outgoingSms)
                .where(
                    and(
                        eq(outgoingSms.parcel_id, parcel.id),
                        eq(outgoingSms.intent, "pickup_updated"),
                    ),
                );

            expect(updateSms).toHaveLength(1);
        });
    });

    describe("End-to-end: queue → process via sendSmsRecord", () => {
        it("should queue and send pickup_updated SMS successfully", async () => {
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

            // Reminder was already sent
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // Queue the pickup_updated SMS
            const queueResult = await queuePickupUpdatedSms(parcel.id);
            expect(queueResult.success).toBe(true);
            expect(queueResult.recordId).toBeDefined();

            // Set next_attempt_at to now so it's ready for sending
            await db
                .update(outgoingSms)
                .set({ next_attempt_at: new Date() })
                .where(eq(outgoingSms.id, queueResult.recordId!));

            // Use mock gateway
            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // Get and send the queued record
            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === queueResult.recordId);
            expect(record).toBeDefined();

            const sendResult = await sendSmsRecord(record!);
            expect(sendResult).toBe(true);

            // Verify it's now sent
            const [sentRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, queueResult.recordId!));

            expect(sentRecord.status).toBe("sent");
            expect(sentRecord.provider_message_id).toBe("mock_1");
            expect(sentRecord.sent_at).not.toBeNull();

            // Verify mock was called with correct data
            expect(mockGateway.getCallCount()).toBe(1);
            expect(mockGateway.getLastCall()?.request.to).toBe("+46701234567");
        });
    });
});
