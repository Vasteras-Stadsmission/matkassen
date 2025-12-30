/**
 * Integration tests for "food parcels ended" SMS notifications.
 *
 * These tests verify the JIT logic that sends SMS to households when:
 * - Their last parcel was terminal (picked up OR no-show) 48+ hours ago
 * - They have no future parcels scheduled
 * - They have no unresolved parcels (past date with no outcome)
 *
 * IMPORTANT: Uses shared TEST_NOW for deterministic testing.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestPickedUpParcel,
    createTestNoShowParcel,
    createTestSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow, hoursFromTestNow } from "../../test-time";
import { outgoingSms, households } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { getHouseholdsForEndedNotification } from "@/app/utils/sms/sms-service";

describe("Food Parcels Ended SMS - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Eligibility Query", () => {
        it("includes household with picked-up parcel 48+ hours ago and no future parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule();

            // Parcel from 3 days ago, picked up 49 hours ago
            const threeDaysAgo = daysFromTestNow(-3);
            await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: threeDaysAgo,
                pickup_date_time_latest: new Date(threeDaysAgo.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-49),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(1);
            expect(eligible[0].householdId).toBe(household.id);
            expect(eligible[0].phoneNumber).toBe("+46701234567");
            expect(eligible[0].locale).toBe("sv");
        });

        it("includes household with no-show parcel 48+ hours ago and no future parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46702345678",
            });
            const { location } = await createTestLocationWithSchedule();

            // Parcel from 3 days ago, marked no-show 49 hours ago
            const threeDaysAgo = daysFromTestNow(-3);
            await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: threeDaysAgo,
                pickup_date_time_latest: new Date(threeDaysAgo.getTime() + 30 * 60 * 1000),
                no_show_at: hoursFromTestNow(-49),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(1);
            expect(eligible[0].householdId).toBe(household.id);
        });

        it("excludes household with terminal parcel less than 48 hours ago", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Parcel picked up 47 hours ago (too recent)
            const twoDaysAgo = daysFromTestNow(-2);
            await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: twoDaysAgo,
                pickup_date_time_latest: new Date(twoDaysAgo.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-47),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(0);
        });

        it("excludes household with future parcel scheduled", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Old parcel picked up 72 hours ago
            const fiveDaysAgo = daysFromTestNow(-5);
            await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                pickup_date_time_latest: new Date(fiveDaysAgo.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-72),
            });

            // But they have a future parcel scheduled
            const tomorrow = daysFromTestNow(1);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
                pickup_date_time_latest: new Date(tomorrow.getTime() + 30 * 60 * 1000),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(0);
        });

        it("excludes household with unresolved parcel (past date, not picked up or no-show)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Old parcel picked up 72 hours ago
            const fiveDaysAgo = daysFromTestNow(-5);
            await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                pickup_date_time_latest: new Date(fiveDaysAgo.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-72),
            });

            // Another parcel from yesterday that's unresolved
            const yesterday = daysFromTestNow(-1);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: yesterday,
                pickup_date_time_latest: new Date(yesterday.getTime() + 30 * 60 * 1000),
                // Not picked up, no no_show_at - this is unresolved
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(0);
        });

        it("excludes anonymized households", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold({
                phone_number: "+46701234567",
            });
            const { location } = await createTestLocationWithSchedule();

            // Mark household as anonymized
            await db
                .update(households)
                .set({ anonymized_at: daysFromTestNow(-1) })
                .where(eq(households.id, household.id));

            // Old parcel picked up 72 hours ago
            const fiveDaysAgo = daysFromTestNow(-5);
            await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                pickup_date_time_latest: new Date(fiveDaysAgo.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-72),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(0);
        });

        // Note: "excludes households without phone number" test is not possible
        // because phone_number has a NOT NULL constraint in the database schema.
        // The SQL query includes a defensive check for phone_number IS NOT NULL.

        it("uses most recent terminal parcel when household has multiple", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Older parcel picked up 100 hours ago
            const sixDaysAgo = daysFromTestNow(-6);
            await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sixDaysAgo,
                pickup_date_time_latest: new Date(sixDaysAgo.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-100),
            });

            // More recent parcel picked up 50 hours ago
            const threeDaysAgo = daysFromTestNow(-3);
            const newerParcel = await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: threeDaysAgo,
                pickup_date_time_latest: new Date(threeDaysAgo.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-50),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(1);
            // Should use the newer parcel as the "last" parcel
            expect(eligible[0].lastParcelId).toBe(newerParcel.id);
        });

        it("returns oldest terminal times first (FIFO processing)", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            // Create three households with different terminal times
            const household1 = await createTestHousehold({ first_name: "Recent" });
            const household2 = await createTestHousehold({ first_name: "Oldest" });
            const household3 = await createTestHousehold({ first_name: "Middle" });

            const fiveDaysAgo = daysFromTestNow(-5);

            // Household1: terminal 50 hours ago
            await createTestPickedUpParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                picked_up_at: hoursFromTestNow(-50),
            });

            // Household2: terminal 100 hours ago (oldest)
            await createTestPickedUpParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                picked_up_at: hoursFromTestNow(-100),
            });

            // Household3: terminal 72 hours ago
            await createTestPickedUpParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                picked_up_at: hoursFromTestNow(-72),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(3);
            expect(eligible[0].householdId).toBe(household2.id); // Oldest first
            expect(eligible[1].householdId).toBe(household3.id); // Middle
            expect(eligible[2].householdId).toBe(household1.id); // Most recent
        });
    });

    describe("Idempotency", () => {
        it("excludes household with existing ended SMS for same parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Old parcel picked up 72 hours ago
            const fiveDaysAgo = daysFromTestNow(-5);
            const parcel = await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                pickup_date_time_latest: new Date(fiveDaysAgo.getTime() + 30 * 60 * 1000),
                picked_up_at: hoursFromTestNow(-72),
            });

            // Already have an ended SMS for this parcel
            await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "food_parcels_ended",
                status: "sent",
            });

            // Manually insert the idempotency key to match what the real code would create
            await db
                .update(outgoingSms)
                .set({
                    idempotency_key: `food_parcels_ended|${household.id}|${parcel.id}`,
                })
                .where(eq(outgoingSms.household_id, household.id));

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(0);
        });

        it("includes household for new ending cycle after new parcel completed", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // First parcel cycle: picked up 200 hours ago
            const tenDaysAgo = daysFromTestNow(-10);
            const oldParcel = await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tenDaysAgo,
                picked_up_at: hoursFromTestNow(-200),
            });

            // We already sent ended SMS for that parcel
            await db.insert(outgoingSms).values({
                household_id: household.id,
                parcel_id: oldParcel.id,
                intent: "food_parcels_ended",
                to_e164: "+46701234567",
                text: "Old ended message",
                status: "sent",
                idempotency_key: `food_parcels_ended|${household.id}|${oldParcel.id}`,
                attempt_count: 1,
                sent_at: hoursFromTestNow(-150),
            });

            // NEW parcel cycle: picked up 50 hours ago (this is now the "last" parcel)
            const threeDaysAgo = daysFromTestNow(-3);
            const newParcel = await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: threeDaysAgo,
                picked_up_at: hoursFromTestNow(-50),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            // Should be eligible again because the new parcel has a different ID
            expect(eligible).toHaveLength(1);
            expect(eligible[0].lastParcelId).toBe(newParcel.id);
        });
    });

    describe("Edge Cases", () => {
        it("handles household with only deleted parcels (no terminal parcel)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Only has a deleted parcel
            const fiveDaysAgo = daysFromTestNow(-5);
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                deleted_at: hoursFromTestNow(-72),
                deleted_by_user_id: "admin",
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            // No terminal parcel, so not eligible
            expect(eligible).toHaveLength(0);
        });

        it("handles household with parcel scheduled for today (not future)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Old parcel picked up 72 hours ago
            const fiveDaysAgo = daysFromTestNow(-5);
            await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: fiveDaysAgo,
                picked_up_at: hoursFromTestNow(-72),
            });

            // Parcel for "today" - this should prevent eligibility
            // (pickup_date_time >= today)
            const today = new Date(TEST_NOW);
            today.setHours(14, 0, 0, 0); // Later today
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: today,
                pickup_date_time_latest: new Date(today.getTime() + 30 * 60 * 1000),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            // Has a parcel today, not eligible for "ended" SMS
            expect(eligible).toHaveLength(0);
        });

        it("handles mix of picked-up and no-show parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Older parcel was picked up
            const tenDaysAgo = daysFromTestNow(-10);
            await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tenDaysAgo,
                picked_up_at: hoursFromTestNow(-200),
            });

            // Most recent parcel was no-show
            const threeDaysAgo = daysFromTestNow(-3);
            const noShowParcel = await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: threeDaysAgo,
                no_show_at: hoursFromTestNow(-50),
            });

            const eligible = await getHouseholdsForEndedNotification(TEST_NOW, db);

            expect(eligible).toHaveLength(1);
            // Should use the no-show parcel as it's most recent
            expect(eligible[0].lastParcelId).toBe(noShowParcel.id);
        });
    });
});
