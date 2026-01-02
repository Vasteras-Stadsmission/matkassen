/**
 * Integration tests for pickup_updated SMS functionality.
 *
 * Tests the complete flow: parcel is rescheduled via updateFoodParcelSchedule action
 * after reminder was sent → update SMS is queued.
 * Verifies the behavior matches real use cases through the actual server action.
 */

import { describe, it, expect, beforeEach, beforeAll, vi } from "vitest";
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
import { getSmsRecordsReadyForSending, sendSmsRecord } from "@/app/utils/sms/sms-service";
import { MockSmsGateway } from "@/app/utils/sms/mock-sms-gateway";
import { setSmsGateway } from "@/app/utils/sms/sms-gateway";

const ADMIN_USERNAME = "test-admin";

// Mock auth for protectedAction wrapper
vi.mock("@/app/utils/auth/server-action-auth", () => ({
    verifyServerActionAuth: vi.fn(() =>
        Promise.resolve({
            success: true,
            data: { user: { githubUsername: ADMIN_USERNAME } },
        }),
    ),
}));

// Import action AFTER mocks are set up
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let updateFoodParcelSchedule: typeof import("@/app/[locale]/schedule/actions").updateFoodParcelSchedule;

describe("Pickup Updated SMS - Integration Tests", () => {
    beforeAll(async () => {
        ({ updateFoodParcelSchedule } = await import("@/app/[locale]/schedule/actions"));
    });

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
                pickup_date_time_latest: new Date(tomorrow.getTime() + 15 * 60 * 1000),
            });

            // Reminder was already sent
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // Admin reschedules parcel to a different time slot (1 hour later)
            const newStartTime = new Date(tomorrow.getTime() + 60 * 60 * 1000);
            const result = await updateFoodParcelSchedule(parcel.id, {
                date: tomorrow,
                startTime: newStartTime,
                endTime: new Date(newStartTime.getTime() + 15 * 60 * 1000),
            });

            // Verify action succeeded
            expect(result.success).toBe(true);

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
                pickup_date_time_latest: new Date(tomorrow.getTime() + 15 * 60 * 1000),
            });

            // No reminder exists yet - parcel was just created

            // Admin reschedules parcel before reminder was sent (1 hour later)
            const newStartTime = new Date(tomorrow.getTime() + 60 * 60 * 1000);
            const result = await updateFoodParcelSchedule(parcel.id, {
                date: tomorrow,
                startTime: newStartTime,
                endTime: new Date(newStartTime.getTime() + 15 * 60 * 1000),
            });

            // Verify action succeeded
            expect(result.success).toBe(true);

            // Verify NO pickup_updated SMS was created (no reminder was sent)
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
                pickup_date_time_latest: new Date(tomorrow.getTime() + 15 * 60 * 1000),
            });

            // Reminder was queued but not sent yet
            await createTestQueuedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // Admin reschedules parcel while reminder is still queued (1 hour later)
            const newStartTime = new Date(tomorrow.getTime() + 60 * 60 * 1000);
            const result = await updateFoodParcelSchedule(parcel.id, {
                date: tomorrow,
                startTime: newStartTime,
                endTime: new Date(newStartTime.getTime() + 15 * 60 * 1000),
            });

            // Verify action succeeded
            expect(result.success).toBe(true);

            // Verify NO pickup_updated SMS was created (only sent reminders trigger updates)
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
                pickup_date_time_latest: new Date(tomorrow.getTime() + 15 * 60 * 1000),
            });

            // Reminder was already sent
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // First reschedule (1 hour later)
            const newStartTime1 = new Date(tomorrow.getTime() + 60 * 60 * 1000);
            const result1 = await updateFoodParcelSchedule(parcel.id, {
                date: tomorrow,
                startTime: newStartTime1,
                endTime: new Date(newStartTime1.getTime() + 15 * 60 * 1000),
            });
            expect(result1.success).toBe(true);

            // Second reschedule (admin changes mind again - 2 hours later)
            const newStartTime2 = new Date(tomorrow.getTime() + 2 * 60 * 60 * 1000);
            const result2 = await updateFoodParcelSchedule(parcel.id, {
                date: tomorrow,
                startTime: newStartTime2,
                endTime: new Date(newStartTime2.getTime() + 15 * 60 * 1000),
            });
            expect(result2.success).toBe(true);

            // Third reschedule (3 hours later)
            const newStartTime3 = new Date(tomorrow.getTime() + 3 * 60 * 60 * 1000);
            const result3 = await updateFoodParcelSchedule(parcel.id, {
                date: tomorrow,
                startTime: newStartTime3,
                endTime: new Date(newStartTime3.getTime() + 15 * 60 * 1000),
            });
            expect(result3.success).toBe(true);

            // Verify only ONE pickup_updated SMS exists (due to idempotency)
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

    describe("End-to-end: reschedule action → queue → send via sendSmsRecord", () => {
        it("should reschedule parcel, queue update SMS, and send successfully", async () => {
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
                pickup_date_time_latest: new Date(tomorrow.getTime() + 15 * 60 * 1000),
            });

            // Reminder was already sent
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            // Admin reschedules parcel via the action (1 hour later)
            const newStartTime = new Date(tomorrow.getTime() + 60 * 60 * 1000);
            const result = await updateFoodParcelSchedule(parcel.id, {
                date: tomorrow,
                startTime: newStartTime,
                endTime: new Date(newStartTime.getTime() + 15 * 60 * 1000),
            });
            expect(result.success).toBe(true);

            // Find the queued pickup_updated SMS
            const [queuedSms] = await db
                .select()
                .from(outgoingSms)
                .where(
                    and(
                        eq(outgoingSms.parcel_id, parcel.id),
                        eq(outgoingSms.intent, "pickup_updated"),
                    ),
                );
            expect(queuedSms).toBeDefined();
            expect(queuedSms.status).toBe("queued");

            // Set next_attempt_at to now so it's ready for sending
            await db
                .update(outgoingSms)
                .set({ next_attempt_at: new Date() })
                .where(eq(outgoingSms.id, queuedSms.id));

            // Use mock gateway
            const mockGateway = new MockSmsGateway().alwaysSucceed();
            setSmsGateway(mockGateway);

            // Get and send the queued record
            const readyRecords = await getSmsRecordsReadyForSending();
            const record = readyRecords.find(r => r.id === queuedSms.id);
            expect(record).toBeDefined();

            const sendResult = await sendSmsRecord(record!);
            expect(sendResult).toBe(true);

            // Verify it's now sent
            const [sentRecord] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, queuedSms.id));

            expect(sentRecord.status).toBe("sent");
            expect(sentRecord.provider_message_id).toBe("mock_1");
            expect(sentRecord.sent_at).not.toBeNull();

            // Verify mock was called with correct data
            expect(mockGateway.getCallCount()).toBe(1);
            expect(mockGateway.getLastCall()?.request.to).toBe("+46701234567");
        });
    });
});
