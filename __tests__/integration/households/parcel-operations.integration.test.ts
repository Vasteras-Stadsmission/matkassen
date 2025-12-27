/**
 * Integration tests for parcel CRUD operations.
 *
 * Tests the ACTUAL database transaction behavior:
 * 1. Insert new parcels
 * 2. Update existing parcels (change time/location)
 * 3. Delete parcels (soft delete via deleted_at)
 * 4. Foreign key constraints
 * 5. Unique constraints (one parcel per household per timeslot)
 *
 * Note: The past-parcel-prevention validation logic is tested in unit tests.
 * These integration tests verify the database operations work correctly.
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
import { foodParcels } from "@/app/db/schema";
import { eq, and, isNull, isNotNull } from "drizzle-orm";

describe("Parcel Operations - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    describe("Parcel Creation", () => {
        it("should create parcel with future pickup time", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);
            futureDate.setHours(14, 0, 0, 0);

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: futureDate,
            });

            expect(parcel.id).toBeDefined();
            expect(parcel.household_id).toBe(household.id);
            expect(parcel.pickup_location_id).toBe(location.id);
            expect(parcel.deleted_at).toBeNull();
            expect(parcel.is_picked_up).toBe(false);
        });

        it("should enforce household foreign key", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            await expect(
                db.insert(foodParcels).values({
                    household_id: "non-existent-household",
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: futureDate,
                    pickup_date_time_latest: new Date(futureDate.getTime() + 30 * 60 * 1000),
                }),
            ).rejects.toThrow();
        });

        it("should enforce pickup location foreign key", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();

            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);

            await expect(
                db.insert(foodParcels).values({
                    household_id: household.id,
                    pickup_location_id: "non-existent-location",
                    pickup_date_time_earliest: futureDate,
                    pickup_date_time_latest: new Date(futureDate.getTime() + 30 * 60 * 1000),
                }),
            ).rejects.toThrow();
        });
    });

    describe("Parcel Updates", () => {
        it("should update pickup time for existing parcel", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const originalDate = new Date();
            originalDate.setDate(originalDate.getDate() + 1);
            originalDate.setHours(10, 0, 0, 0);

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: originalDate,
            });

            // Update to different time
            const newDate = new Date();
            newDate.setDate(newDate.getDate() + 2);
            newDate.setHours(15, 0, 0, 0);

            await db
                .update(foodParcels)
                .set({
                    pickup_date_time_earliest: newDate,
                    pickup_date_time_latest: new Date(newDate.getTime() + 30 * 60 * 1000),
                })
                .where(eq(foodParcels.id, parcel.id));

            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updated.pickup_date_time_earliest).toEqual(newDate);
        });

        it("should change pickup location", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location: location1 } = await createTestLocationWithSchedule();
            const { location: location2 } = await createTestLocationWithSchedule();

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location1.id,
            });

            expect(parcel.pickup_location_id).toBe(location1.id);

            await db
                .update(foodParcels)
                .set({ pickup_location_id: location2.id })
                .where(eq(foodParcels.id, parcel.id));

            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updated.pickup_location_id).toBe(location2.id);
        });

        it("should mark parcel as picked up", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            expect(parcel.is_picked_up).toBe(false);

            const pickedUpAt = new Date();
            await db
                .update(foodParcels)
                .set({
                    is_picked_up: true,
                    picked_up_at: pickedUpAt,
                    picked_up_by_user_id: "volunteer-user",
                })
                .where(eq(foodParcels.id, parcel.id));

            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(updated.is_picked_up).toBe(true);
            expect(updated.picked_up_by_user_id).toBe("volunteer-user");
        });
    });

    describe("Soft Delete", () => {
        it("should soft delete parcel by setting deleted_at", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            expect(parcel.deleted_at).toBeNull();

            const deletedAt = new Date();
            await db
                .update(foodParcels)
                .set({
                    deleted_at: deletedAt,
                    deleted_by_user_id: "admin-user",
                })
                .where(eq(foodParcels.id, parcel.id));

            // Parcel still exists but is soft-deleted
            const [softDeleted] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));

            expect(softDeleted).toBeDefined();
            expect(softDeleted.deleted_at).toBeInstanceOf(Date);
            expect(softDeleted.deleted_by_user_id).toBe("admin-user");
        });

        it("should exclude soft-deleted parcels from active queries", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create active and deleted parcels
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });
            await createTestDeletedParcel({
                household_id: household.id,
                pickup_location_id: location.id,
            });

            // Query only active parcels
            const activeParcels = await db
                .select()
                .from(foodParcels)
                .where(
                    and(eq(foodParcels.household_id, household.id), isNull(foodParcels.deleted_at)),
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
            const endDate = new Date(pickupDate.getTime() + 30 * 60 * 1000);

            // Create and cancel a parcel
            const parcel1 = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
                pickup_date_time_latest: endDate,
            });

            // Soft delete
            await db
                .update(foodParcels)
                .set({ deleted_at: new Date(), deleted_by_user_id: "admin" })
                .where(eq(foodParcels.id, parcel1.id));

            // Create new parcel for same slot - should succeed due to partial unique index
            const parcel2 = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupDate,
                pickup_date_time_latest: endDate,
            });

            expect(parcel2.id).not.toBe(parcel1.id);

            // Only 1 active parcel
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

    describe("Batch Operations", () => {
        it("should handle multiple parcels for same household", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create 3 parcels for different times
            for (let i = 0; i < 3; i++) {
                const pickupDate = new Date(baseDate);
                pickupDate.setHours(10 + i, 0, 0, 0);

                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupDate,
                    pickup_date_time_latest: new Date(pickupDate.getTime() + 30 * 60 * 1000),
                });
            }

            const parcels = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.household_id, household.id));

            expect(parcels).toHaveLength(3);
        });

        it("should soft delete all parcels for household in one operation", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create multiple parcels
            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            for (let i = 0; i < 3; i++) {
                const pickupDate = new Date(baseDate);
                pickupDate.setHours(10 + i, 0, 0, 0);

                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupDate,
                    pickup_date_time_latest: new Date(pickupDate.getTime() + 30 * 60 * 1000),
                });
            }

            // Soft delete all
            await db
                .update(foodParcels)
                .set({ deleted_at: new Date(), deleted_by_user_id: "admin" })
                .where(eq(foodParcels.household_id, household.id));

            // All should be deleted
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
            expect(deletedParcels).toHaveLength(3);
        });
    });
});
