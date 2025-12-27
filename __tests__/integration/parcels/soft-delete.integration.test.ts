/**
 * Integration tests for softDeleteParcel functionality.
 *
 * Tests the ACTUAL database behavior, not mocked business logic.
 * The unit tests in softDeleteParcel.test.ts cover the SMS cancellation logic.
 *
 * These integration tests verify:
 * 1. Soft delete actually updates the database
 * 2. Partial unique index allows re-creating parcels after deletion
 * 3. SMS records are properly updated/inserted
 * 4. Foreign key relationships work correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
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
import { foodParcels, outgoingSms } from "@/app/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";
import { softDeleteParcelInTransaction } from "@/app/[locale]/parcels/actions";

describe("softDeleteParcel - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("Basic Soft Delete", () => {
        it("should set deleted_at and deleted_by_user_id", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            // Call the transaction helper directly (bypasses auth wrapper)
            // Note: Type assertion needed because PGlite and postgres-js have different HKT types
            // but are runtime-compatible for Drizzle operations
            await db.transaction(async tx => {
                await softDeleteParcelInTransaction(tx as any, parcel.id, "test-admin");
            });

            // Verify parcel is soft-deleted
            const [deletedParcel] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(deletedParcel.deleted_at).not.toBeNull();
            expect(deletedParcel.deleted_by_user_id).toBe("test-admin");
            expect(deletedParcel.is_picked_up).toBe(false); // Unchanged
        });

        it("should silently skip already-deleted parcels", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create an already-deleted parcel
            const [parcel] = await db
                .insert(foodParcels)
                .values({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: new Date(Date.now() + 24 * 60 * 60 * 1000),
                    pickup_date_time_latest: new Date(
                        Date.now() + 24 * 60 * 60 * 1000 + 30 * 60 * 1000,
                    ),
                    deleted_at: new Date(), // Already deleted
                    deleted_by_user_id: "original-admin",
                })
                .returning();

            // Try to delete again
            let result: { smsCancelled: boolean; smsSent: boolean } | undefined;
            await db.transaction(async tx => {
                result = await softDeleteParcelInTransaction(tx as any, parcel.id, "second-admin");
            });

            // Should return silently without changes
            expect(result?.smsCancelled).toBe(false);
            expect(result?.smsSent).toBe(false);

            // Verify original deletion is preserved
            const [unchangedParcel] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(unchangedParcel.deleted_by_user_id).toBe("original-admin");
        });
    });

    describe("Partial Unique Index Behavior", () => {
        it("should allow creating new parcel after soft-deleting one with same slot", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const pickupTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const pickupEndTime = new Date(pickupTime.getTime() + 30 * 60 * 1000);

            // Create first parcel
            const parcel1 = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
                pickup_date_time_latest: pickupEndTime,
            });

            // Soft delete it
            await db.transaction(async tx => {
                await softDeleteParcelInTransaction(tx as any, parcel1.id, "test-admin");
            });

            // Create second parcel with SAME slot - should succeed due to partial index
            const parcel2 = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
                pickup_date_time_latest: pickupEndTime,
            });

            expect(parcel2.id).not.toBe(parcel1.id);

            // Verify we now have 2 parcels - one deleted, one active
            const allParcels = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.household_id, household.id));

            expect(allParcels).toHaveLength(2);

            const deletedParcels = allParcels.filter(p => p.deleted_at !== null);
            const activeParcels = allParcels.filter(p => p.deleted_at === null);

            expect(deletedParcels).toHaveLength(1);
            expect(activeParcels).toHaveLength(1);
        });

        it("should allow multiple soft-deleted parcels with same slot", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const pickupTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const pickupEndTime = new Date(pickupTime.getTime() + 30 * 60 * 1000);

            // Create and delete 3 parcels with same slot
            for (let i = 0; i < 3; i++) {
                const parcel = await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
                    pickup_date_time_latest: pickupEndTime,
                });

                await db.transaction(async tx => {
                    await softDeleteParcelInTransaction(tx as any, parcel.id, `admin-${i}`);
                });
            }

            // Verify all 3 are soft-deleted
            const deletedParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.household_id, household.id),
                        isNotNull(foodParcels.deleted_at),
                    ),
                );

            expect(deletedParcels).toHaveLength(3);
        });
    });

    describe("SMS Handling", () => {
        it("should cancel queued SMS when deleting parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            // Create a queued SMS for this parcel
            const sms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "queued",
            });

            // Delete the parcel
            let result: { smsCancelled: boolean; smsSent: boolean } | undefined;
            await db.transaction(async tx => {
                result = await softDeleteParcelInTransaction(tx as any, parcel.id, "test-admin");
            });

            expect(result?.smsCancelled).toBe(true);
            expect(result?.smsSent).toBe(false);

            // Verify SMS is cancelled
            const [updatedSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, sms.id));

            expect(updatedSms.status).toBe("cancelled");
        });

        it("should insert cancellation SMS when original was already sent", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            // Create a SENT SMS for this parcel
            await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "sent",
                sent_at: new Date(),
            });

            // Delete the parcel
            let result: { smsCancelled: boolean; smsSent: boolean } | undefined;
            await db.transaction(async tx => {
                result = await softDeleteParcelInTransaction(tx as any, parcel.id, "test-admin");
            });

            expect(result?.smsCancelled).toBe(false);
            expect(result?.smsSent).toBe(true);

            // Verify cancellation SMS was created
            const allSms = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.parcel_id, parcel.id));

            const cancellationSms = allSms.find(s => s.intent === "pickup_cancelled");
            expect(cancellationSms).toBeDefined();
            expect(cancellationSms?.status).toBe("queued");
            expect(cancellationSms?.household_id).toBe(household.id);
        });

        it("should not create SMS for parcel with no existing SMS", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            // No SMS created for this parcel

            let result: { smsCancelled: boolean; smsSent: boolean } | undefined;
            await db.transaction(async tx => {
                result = await softDeleteParcelInTransaction(tx as any, parcel.id, "test-admin");
            });

            expect(result?.smsCancelled).toBe(false);
            expect(result?.smsSent).toBe(false);

            // Verify no SMS exists
            const smsRecords = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.parcel_id, parcel.id));

            expect(smsRecords).toHaveLength(0);
        });

        it("should cancel queued pickup_updated SMS when deleting parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            // Reminder was sent, then pickup_updated was queued (reschedule scenario)
            await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
                status: "sent",
                sent_at: new Date(),
            });

            const updateSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_updated",
                status: "queued",
            });

            // Delete the parcel
            await db.transaction(async tx => {
                await softDeleteParcelInTransaction(tx as any, parcel.id, "test-admin");
            });

            // Verify pickup_updated SMS is cancelled
            const [updatedSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, updateSms.id));

            expect(updatedSms.status).toBe("cancelled");
        });

        it("should cancel retrying pickup_updated SMS when deleting parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            // Create a retrying pickup_updated SMS (failed once, scheduled for retry)
            const updateSms = await createTestSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_updated",
                status: "retrying",
                next_attempt_at: new Date(Date.now() + 5 * 60 * 1000), // Retry in 5 min
            });

            // Delete the parcel
            await db.transaction(async tx => {
                await softDeleteParcelInTransaction(tx as any, parcel.id, "test-admin");
            });

            // Verify pickup_updated SMS is cancelled and next_attempt_at is cleared
            const [updatedSms] = await db
                .select()
                .from(outgoingSms)
                .where(eq(outgoingSms.id, updateSms.id));

            expect(updatedSms.status).toBe("cancelled");
            expect(updatedSms.next_attempt_at).toBeNull();
        });
    });
});
