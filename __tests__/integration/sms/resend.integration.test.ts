/**
 * Integration tests for SMS resend functionality.
 *
 * Tests the complete flow: admin clicks retry on failed/sent SMS → new SMS is queued.
 * Verifies the behavior matches real use cases, not implementation details.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestFailedSms,
    createTestSentSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { daysFromTestNow } from "../../test-time";
import { outgoingSms } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { createSmsRecord } from "@/app/utils/sms/sms-service";
import { nanoid } from "nanoid";

describe("SMS Resend - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Admin clicks 'Try Again' on failed SMS", () => {
        it("should create a new SMS record when using resend action", async () => {
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

            // Create initial failed SMS
            const failedSms = await createTestFailedSms({
                household_id: household.id,
                parcel_id: parcel.id,
                error_message: "Provider temporarily unavailable",
            });

            // Admin clicks "Try Again" - this should use resend action
            // Simulating what the API does when action === "resend"
            const newSmsId = await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: household.id,
                toE164: "+46701234567",
                text: "Test pickup reminder",
                idempotencyKey: `pickup_reminder|${parcel.id}|manual|${nanoid(8)}`,
            });

            // Verify a NEW SMS was created (different ID from failed one)
            expect(newSmsId).not.toBe(failedSms.id);

            // Verify there are now 2 SMS records for this parcel
            const allSms = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.parcel_id, parcel.id));

            expect(allSms).toHaveLength(2);

            // Original failed SMS should still exist
            const originalSms = allSms.find(s => s.id === failedSms.id);
            expect(originalSms?.status).toBe("failed");

            // New SMS should be queued
            const newSms = allSms.find(s => s.id === newSmsId);
            expect(newSms?.status).toBe("queued");
        });

        it("should NOT create new SMS when using send action (deduplication)", async () => {
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

            // Create initial SMS using production code (to get correct idempotency key)
            const initialSmsId = await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: household.id,
                toE164: "+46701234567",
                text: "Test pickup reminder",
            });

            // Mark it as failed (simulating a delivery failure)
            await db
                .update(outgoingSms)
                .set({ status: "failed", last_error_message: "Provider unavailable" })
                .where(eq(outgoingSms.id, initialSmsId));

            // Simulate clicking button with action="send" (the old broken behavior)
            // This should return the existing record due to idempotency
            const returnedId = await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: household.id,
                toE164: "+46701234567",
                text: "Test pickup reminder",
                // No custom idempotencyKey - uses stable key
            });

            // Should still only have 1 SMS (the original failed one)
            const allSms = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.parcel_id, parcel.id));

            expect(allSms).toHaveLength(1);
            expect(allSms[0].status).toBe("failed");
            expect(returnedId).toBe(allSms[0].id);
        });
    });

    describe("Admin clicks 'Send Again' on already-sent SMS", () => {
        it("should create a new SMS record when using resend action", async () => {
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

            // Create initial sent SMS
            const sentSms = await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
            });

            // Admin clicks "Send Again" - uses resend action
            const newSmsId = await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: household.id,
                toE164: "+46701234567",
                text: "Test pickup reminder",
                idempotencyKey: `pickup_reminder|${parcel.id}|manual|${nanoid(8)}`,
            });

            // Verify a NEW SMS was created
            expect(newSmsId).not.toBe(sentSms.id);

            // Verify both exist
            const allSms = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.parcel_id, parcel.id));

            expect(allSms).toHaveLength(2);

            // Original sent SMS still exists
            const originalSms = allSms.find(s => s.id === sentSms.id);
            expect(originalSms?.status).toBe("sent");

            // New SMS is queued
            const newSms = allSms.find(s => s.id === newSmsId);
            expect(newSms?.status).toBe("queued");
        });
    });

    describe("First-time send with deduplication protection", () => {
        it("should create SMS on first send", async () => {
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

            // First send - no existing SMS
            const firstSmsId = await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: household.id,
                toE164: "+46701234567",
                text: "Test pickup reminder",
                // Uses stable idempotency key (default)
            });

            const allSms = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.parcel_id, parcel.id));

            expect(allSms).toHaveLength(1);
            expect(allSms[0].id).toBe(firstSmsId);
            expect(allSms[0].status).toBe("queued");
        });

        it("should prevent duplicate when clicking send again without refresh", async () => {
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

            // First click - creates SMS
            const firstSmsId = await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: household.id,
                toE164: "+46701234567",
                text: "Test pickup reminder",
            });

            // User accidentally double-clicks (same action="send")
            const secondSmsId = await createSmsRecord({
                intent: "pickup_reminder",
                parcelId: parcel.id,
                householdId: household.id,
                toE164: "+46701234567",
                text: "Test pickup reminder",
            });

            // Should return the same ID (deduplication worked)
            expect(secondSmsId).toBe(firstSmsId);

            // Should only have 1 SMS record
            const allSms = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.parcel_id, parcel.id));

            expect(allSms).toHaveLength(1);
        });
    });
});
