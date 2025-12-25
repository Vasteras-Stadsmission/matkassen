/**
 * Integration tests for parcel update operations.
 *
 * Tests ACTUAL database behavior for parcel CRUD operations.
 * The unit tests in actions.test.ts cover time validation logic.
 *
 * These integration tests verify:
 * 1. Parcel upsert works correctly
 * 2. Removed parcels are soft-deleted
 * 3. Foreign key constraints are respected
 * 4. Parcel updates preserve data integrity
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { foodParcels } from "@/app/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";

describe("Parcel Update Operations - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    describe("Parcel Creation", () => {
        it("should create parcel with all required fields", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const pickupStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
            pickupStart.setHours(10, 0, 0, 0);
            const pickupEnd = new Date(pickupStart.getTime() + 30 * 60 * 1000);

            const [parcel] = await db
                .insert(foodParcels)
                .values({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupStart,
                    pickup_date_time_latest: pickupEnd,
                })
                .returning();

            expect(parcel.id).toBeDefined();
            expect(parcel.household_id).toBe(household.id);
            expect(parcel.pickup_location_id).toBe(location.id);
            expect(parcel.is_picked_up).toBe(false);
            expect(parcel.deleted_at).toBeNull();
        });

        it("should fail if household does not exist", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            const pickupStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const pickupEnd = new Date(pickupStart.getTime() + 30 * 60 * 1000);

            await expect(
                db.insert(foodParcels).values({
                    household_id: "non-existent-household",
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupStart,
                    pickup_date_time_latest: pickupEnd,
                }),
            ).rejects.toThrow();
        });

        it("should fail if pickup location does not exist", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const pickupStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const pickupEnd = new Date(pickupStart.getTime() + 30 * 60 * 1000);

            await expect(
                db.insert(foodParcels).values({
                    household_id: household.id,
                    pickup_location_id: "non-existent-location",
                    pickup_date_time_earliest: pickupStart,
                    pickup_date_time_latest: pickupEnd,
                }),
            ).rejects.toThrow();
        });
    });

    describe("Parcel Updates", () => {
        it("should update parcel pickup times", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            const newPickupStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
            newPickupStart.setHours(14, 0, 0, 0);
            const newPickupEnd = new Date(newPickupStart.getTime() + 30 * 60 * 1000);

            await db
                .update(foodParcels)
                .set({
                    pickup_date_time_earliest: newPickupStart,
                    pickup_date_time_latest: newPickupEnd,
                })
                .where(eq(foodParcels.id, parcel.id));

            const [updatedParcel] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updatedParcel.pickup_date_time_earliest).toEqual(newPickupStart);
            expect(updatedParcel.pickup_date_time_latest).toEqual(newPickupEnd);
        });

        it("should mark parcel as picked up", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            const pickedUpAt = new Date();

            await db
                .update(foodParcels)
                .set({
                    is_picked_up: true,
                    picked_up_at: pickedUpAt,
                    picked_up_by_user_id: "volunteer-1",
                })
                .where(eq(foodParcels.id, parcel.id));

            const [updatedParcel] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updatedParcel.is_picked_up).toBe(true);
            expect(updatedParcel.picked_up_at).toBeInstanceOf(Date);
            expect(updatedParcel.picked_up_by_user_id).toBe("volunteer-1");
        });
    });

    describe("Batch Operations", () => {
        it("should handle multiple parcels for same household", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);

            // Create 3 parcels for different days
            for (let i = 0; i < 3; i++) {
                const pickupDate = new Date(baseDate);
                pickupDate.setDate(pickupDate.getDate() + i);
                pickupDate.setHours(10, 0, 0, 0);

                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupDate,
                });
            }

            const parcels = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.household_id, household.id));

            expect(parcels).toHaveLength(3);
        });

        it("should soft-delete multiple parcels in one operation", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create parcels with DIFFERENT time slots to avoid unique constraint
            const pickupTime1 = new Date(Date.now() + 24 * 60 * 60 * 1000);
            pickupTime1.setHours(10, 0, 0, 0);
            const pickupTime2 = new Date(Date.now() + 24 * 60 * 60 * 1000);
            pickupTime2.setHours(11, 0, 0, 0);

            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime1,
                pickup_date_time_latest: new Date(pickupTime1.getTime() + 30 * 60 * 1000),
            });
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime2,
                pickup_date_time_latest: new Date(pickupTime2.getTime() + 30 * 60 * 1000),
            });

            // Soft-delete both parcels
            await db
                .update(foodParcels)
                .set({
                    deleted_at: new Date(),
                    deleted_by_user_id: "admin",
                })
                .where(eq(foodParcels.household_id, household.id));

            const activeParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)),
                );

            const deletedParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.household_id, household.id),
                        isNotNull(foodParcels.deleted_at),
                    ),
                );

            expect(activeParcels).toHaveLength(0);
            expect(deletedParcels).toHaveLength(2);
        });
    });

    describe("Location Change", () => {
        it("should allow changing pickup location", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location: location1 } = await createTestLocationWithSchedule();
            const { location: location2 } = await createTestLocationWithSchedule();

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location1.id,
            });

            expect(parcel.pickup_location_id).toBe(location1.id);

            // Change location
            await db
                .update(foodParcels)
                .set({ pickup_location_id: location2.id })
                .where(eq(foodParcels.id, parcel.id));

            const [updatedParcel] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updatedParcel.pickup_location_id).toBe(location2.id);
        });
    });
});
