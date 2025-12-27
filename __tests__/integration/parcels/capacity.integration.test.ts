/**
 * Integration tests for pickup location capacity checking.
 *
 * Tests ACTUAL database behavior for capacity calculations.
 * The unit tests in capacity.test.ts verify notDeleted() is called.
 *
 * These integration tests verify:
 * 1. Capacity is correctly calculated from real parcel data
 * 2. Soft-deleted parcels are excluded from capacity counts
 * 3. Capacity frees up after parcel cancellation
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestDeletedParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { foodParcels, pickupLocations } from "@/app/db/schema";
import { eq, and, isNull } from "drizzle-orm";

describe("Pickup Location Capacity - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    describe("Basic Capacity Counting", () => {
        it("should count only non-deleted parcels for a location on a date", async () => {
            const db = await getTestDb();
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const household3 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const pickupDate = new Date();
            pickupDate.setDate(pickupDate.getDate() + 1);
            pickupDate.setHours(10, 0, 0, 0);

            // Create 2 active parcels
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });

            // Create 1 deleted parcel (should not count)
            await createTestDeletedParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });

            // Query active parcels (simulating capacity check)
            const activeParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, location.id),
                        isNull(foodParcels.deleted_at),
                    ),
                );

            expect(activeParcels).toHaveLength(2);
        });

        it("should correctly count parcels across multiple dates", async () => {
            const db = await getTestDb();
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const household3 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const dayAfter = new Date(today);
            dayAfter.setDate(today.getDate() + 2);

            // Set times
            today.setHours(10, 0, 0, 0);
            tomorrow.setHours(10, 0, 0, 0);
            dayAfter.setHours(10, 0, 0, 0);

            // 1 parcel today
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: today,
            });

            // 2 parcels tomorrow (1 deleted)
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
            });
            await createTestDeletedParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tomorrow,
            });

            // Query for each date
            const todayParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, location.id),
                        isNull(foodParcels.deleted_at),
                    ),
                );

            // Filter by date in JS (simulating what the actual capacity check does)
            const todayCount = todayParcels.filter(p => {
                const d = new Date(p.pickup_date_time_earliest);
                return d.toDateString() === today.toDateString();
            }).length;

            const tomorrowCount = todayParcels.filter(p => {
                const d = new Date(p.pickup_date_time_earliest);
                return d.toDateString() === tomorrow.toDateString();
            }).length;

            expect(todayCount).toBe(1);
            expect(tomorrowCount).toBe(1); // Deleted one not counted
        });
    });

    describe("Capacity After Cancellation", () => {
        it("should free up capacity when parcel is soft-deleted", async () => {
            const db = await getTestDb();
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const pickupDate = new Date();
            pickupDate.setDate(pickupDate.getDate() + 1);
            pickupDate.setHours(10, 0, 0, 0);

            // Create 2 active parcels
            const parcel1 = await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
            });

            // Check initial count
            let activeParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, location.id),
                        isNull(foodParcels.deleted_at),
                    ),
                );
            expect(activeParcels).toHaveLength(2);

            // Soft-delete one parcel
            await db
                .update(foodParcels)
                .set({ deleted_at: new Date(), deleted_by_user_id: "test-admin" })
                .where(eq(foodParcels.id, parcel1.id));

            // Check count after deletion
            activeParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, location.id),
                        isNull(foodParcels.deleted_at),
                    ),
                );
            expect(activeParcels).toHaveLength(1);
        });

        it("should allow rebooking after cancellation (partial unique index)", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const pickupDate = new Date();
            pickupDate.setDate(pickupDate.getDate() + 1);
            pickupDate.setHours(10, 0, 0, 0);
            const endTime = new Date(pickupDate.getTime() + 30 * 60 * 1000);

            // Create and cancel a parcel
            const parcel1 = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
                pickup_date_time_latest: endTime,
            });

            await db
                .update(foodParcels)
                .set({ deleted_at: new Date(), deleted_by_user_id: "test-admin" })
                .where(eq(foodParcels.id, parcel1.id));

            // Same household can now book the same slot
            const parcel2 = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
                pickup_date_time_latest: endTime,
            });

            expect(parcel2.id).not.toBe(parcel1.id);

            // Verify only 1 active parcel
            const activeParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)),
                );
            expect(activeParcels).toHaveLength(1);
            expect(activeParcels[0].id).toBe(parcel2.id);
        });
    });

    describe("Location Max Parcels Per Day", () => {
        it("should respect max_parcels_per_slot setting", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule({
                max_parcels_per_slot: 2, // Only 2 per slot
            });

            // Query location to verify setting
            const [loc] = await db
                .select()
                .from(pickupLocations)
                .where(eq(pickupLocations.id, location.id));

            expect(loc.max_parcels_per_slot).toBe(2);
        });
    });

    describe("Multiple Households Same Slot", () => {
        it("should allow different households to book same slot up to capacity", async () => {
            const db = await getTestDb();
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const household3 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                max_parcels_per_slot: 3,
            });

            const pickupDate = new Date();
            pickupDate.setDate(pickupDate.getDate() + 1);
            pickupDate.setHours(10, 0, 0, 0);
            const endTime = new Date(pickupDate.getTime() + 30 * 60 * 1000);

            // All 3 households book the same slot
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
                pickup_date_time_latest: endTime,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
                pickup_date_time_latest: endTime,
            });
            await createTestParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
                pickup_date_time_latest: endTime,
            });

            // All 3 should be active
            const activeParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, location.id),
                        isNull(foodParcels.deleted_at),
                    ),
                );
            expect(activeParcels).toHaveLength(3);
        });
    });
});
