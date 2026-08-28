/**
 * Integration tests for bulk reschedule functionality.
 *
 * Tests the bulkRescheduleParcels server action against a real (PGlite) database.
 * Covers: happy path, picked-up rejection, daily capacity,
 * opening hours validation, and outside_hours_count recomputation.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestPickedUpParcel,
    createTestNoShowParcel,
    createTestDeletedParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { foodParcels, pickupLocationDailyLimits, pickupLocations } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEST_NOW, daysFromTestNow } from "../../test-time";
import { stockholmDateKey } from "@/app/utils/capacity/daily-limits";

// Mock auth to inject session
type MockSession = { user: { githubUsername: string; name: string; role: "admin" } };
const mockSession: MockSession = {
    user: { githubUsername: "test-admin", name: "Test Admin", role: "admin" },
};

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedAdminAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedReadAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedAgreementReadAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedAdminAgreementReadAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
    protectedAgreementAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
}));

// Mock SMS service to track calls without side effects
const mockQueuePickupUpdatedSms = vi.fn().mockResolvedValue({ success: true, skipped: true });
vi.mock("@/app/utils/sms/sms-service", () => ({
    queuePickupUpdatedSms: (...args: unknown[]) => mockQueuePickupUpdatedSms(...args),
}));

// Import after mocks
import { bulkRescheduleParcels, updateFoodParcelSchedule } from "@/app/[locale]/schedule/actions";

describe("bulkRescheduleParcels - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        mockQueuePickupUpdatedSms.mockClear();
    });

    // TEST_NOW is Saturday 2024-06-15 10:00 UTC.
    // Schedules default to Mon-Fri 9-17, so use Monday (daysFromTestNow(2) = 2024-06-17).
    function nextMonday10am() {
        const d = daysFromTestNow(2); // Monday
        d.setHours(10, 0, 0, 0);
        return d;
    }

    describe("Happy path", () => {
        it("reschedules multiple parcels to the same pickup time within daily capacity", async () => {
            const db = await getTestDb();
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });

            // Create 2 parcels at Tuesday 10:00
            const tue = daysFromTestNow(3);
            tue.setHours(10, 0, 0, 0);
            const p1 = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });
            const p2 = await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });

            // Reschedule both to Monday 10:00
            const newTime = nextMonday10am();
            const result = await bulkRescheduleParcels([p1.id, p2.id], {
                startTime: newTime,
            });

            expect(result).toMatchObject({ success: true, data: { count: 2 } });

            // Verify DB state
            const [updated1] = await db.select().from(foodParcels).where(eq(foodParcels.id, p1.id));
            const [updated2] = await db.select().from(foodParcels).where(eq(foodParcels.id, p2.id));

            expect(updated1.pickup_date_time_earliest).toEqual(newTime);
            expect(updated2.pickup_date_time_earliest).toEqual(newTime);

            // Verify end time = start + slot duration (default 15 min)
            const expectedEnd = new Date(newTime.getTime() + 15 * 60 * 1000);
            expect(updated1.pickup_date_time_latest).toEqual(expectedEnd);
        });

        it("should queue SMS for each rescheduled parcel", async () => {
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tue = daysFromTestNow(3);
            tue.setHours(10, 0, 0, 0);
            const p1 = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });
            const p2 = await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });

            await bulkRescheduleParcels([p1.id, p2.id], {
                startTime: nextMonday10am(),
            });

            expect(mockQueuePickupUpdatedSms).toHaveBeenCalledTimes(2);
            expect(mockQueuePickupUpdatedSms).toHaveBeenCalledWith(p1.id);
            expect(mockQueuePickupUpdatedSms).toHaveBeenCalledWith(p2.id);
        });
    });

    describe("Validation", () => {
        it("should reject empty parcel list", async () => {
            const result = await bulkRescheduleParcels([], {
                startTime: nextMonday10am(),
            });

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
            });
        });

        it("should reject if any parcel is already picked up", async () => {
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tue = daysFromTestNow(3);
            tue.setHours(10, 0, 0, 0);
            const active = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });
            const pickedUp = await createTestPickedUpParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });

            const result = await bulkRescheduleParcels([active.id, pickedUp.id], {
                startTime: nextMonday10am(),
            });

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
            });
        });

        it("should reject if any parcel is already marked as no-show", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const sourceTime = daysFromTestNow(3);
            sourceTime.setHours(10, 0, 0, 0);
            const noShow = await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sourceTime,
            });

            const result = await bulkRescheduleParcels([noShow.id], {
                startTime: nextMonday10am(),
            });

            expect(result).toMatchObject({
                success: false,
                error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
            });
            expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
        });

        it("rejects a single reschedule after the parcel has been handed out", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const sourceTime = daysFromTestNow(3);
            sourceTime.setHours(10, 0, 0, 0);
            const pickedUp = await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sourceTime,
            });

            const result = await updateFoodParcelSchedule(pickedUp.id, {
                date: nextMonday10am(),
                startTime: nextMonday10am(),
                endTime: new Date(nextMonday10am().getTime() + 15 * 60 * 1000),
            });

            expect(result).toMatchObject({
                success: false,
                error: expect.objectContaining({ code: "ALREADY_PICKED_UP" }),
            });
            const [unchanged] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, pickedUp.id));
            expect(unchanged.pickup_date_time_earliest).toEqual(sourceTime);
            expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
        });

        it("rejects a single reschedule after the parcel is marked as no-show", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();
            const sourceTime = daysFromTestNow(3);
            sourceTime.setHours(10, 0, 0, 0);
            const noShow = await createTestNoShowParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sourceTime,
            });

            const result = await updateFoodParcelSchedule(noShow.id, {
                date: nextMonday10am(),
                startTime: nextMonday10am(),
                endTime: new Date(nextMonday10am().getTime() + 15 * 60 * 1000),
            });

            expect(result).toMatchObject({
                success: false,
                error: expect.objectContaining({ code: "ALREADY_NO_SHOW" }),
            });
            const [unchanged] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, noShow.id));
            expect(unchanged.pickup_date_time_earliest).toEqual(sourceTime);
            expect(mockQueuePickupUpdatedSms).not.toHaveBeenCalled();
        });

        it("should reject if parcels belong to different locations", async () => {
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const { location: loc1 } = await createTestLocationWithSchedule();
            const { location: loc2 } = await createTestLocationWithSchedule();

            const tue = daysFromTestNow(3);
            tue.setHours(10, 0, 0, 0);
            const p1 = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: loc1.id,
                pickup_date_time_earliest: tue,
            });
            const p2 = await createTestParcel({
                household_id: h2.id,
                pickup_location_id: loc2.id,
                pickup_date_time_earliest: tue,
            });

            const result = await bulkRescheduleParcels([p1.id, p2.id], {
                startTime: nextMonday10am(),
            });

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
            });
        });

        it("should reject if a parcel ID does not exist", async () => {
            const h1 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tue = daysFromTestNow(3);
            tue.setHours(10, 0, 0, 0);
            const p1 = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });

            const result = await bulkRescheduleParcels([p1.id, "nonexistent-id"], {
                startTime: nextMonday10am(),
            });

            expect(result.success).toBe(false);
        });

        it("should not count soft-deleted parcels as existing", async () => {
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const tue = daysFromTestNow(3);
            tue.setHours(10, 0, 0, 0);
            const active = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });

            // Create a deleted parcel — should not affect the "found" count
            await createTestDeletedParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });

            // Only pass the active parcel — should succeed
            const result = await bulkRescheduleParcels([active.id], {
                startTime: nextMonday10am(),
            });

            expect(result.success).toBe(true);
        });
    });

    describe("Daily capacity", () => {
        it("should reject when daily capacity would be exceeded", async () => {
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const h3 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });

            const targetTime = nextMonday10am();

            // Pre-fill the day with 2 parcels (different time slots, same day)
            const slot1 = new Date(targetTime);
            slot1.setHours(9, 0, 0, 0);
            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: slot1,
                pickup_date_time_latest: new Date(slot1.getTime() + 15 * 60 * 1000),
            });
            const slot2 = new Date(targetTime);
            slot2.setHours(11, 0, 0, 0);
            await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: slot2,
                pickup_date_time_latest: new Date(slot2.getTime() + 15 * 60 * 1000),
            });

            // Try to move another parcel to same day
            const diffDay = daysFromTestNow(4); // Tuesday
            diffDay.setHours(10, 0, 0, 0);
            const toMove = await createTestParcel({
                household_id: h3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: diffDay,
            });

            const result = await bulkRescheduleParcels([toMove.id], {
                startTime: targetTime,
            });

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                error: expect.objectContaining({ code: "CAPACITY_EXCEEDED" }),
            });
        });

        it("allows a single time-only move on an already over-capacity date", async () => {
            const db = await getTestDb();
            const movingHousehold = await createTestHousehold();
            const otherHousehold = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 1,
            });
            const originalTime = nextMonday10am();
            const parcel = await createTestParcel({
                household_id: movingHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: originalTime,
                pickup_date_time_latest: new Date(originalTime.getTime() + 15 * 60 * 1000),
            });
            const otherTime = new Date(originalTime);
            otherTime.setHours(9, 0, 0, 0);
            await createTestParcel({
                household_id: otherHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: otherTime,
                pickup_date_time_latest: new Date(otherTime.getTime() + 15 * 60 * 1000),
            });
            const targetTime = new Date(originalTime);
            targetTime.setHours(11, 0, 0, 0);

            const result = await updateFoodParcelSchedule(parcel.id, {
                date: targetTime,
                startTime: targetTime,
                endTime: new Date(targetTime.getTime() + 15 * 60 * 1000),
            });

            expect(result.success).toBe(true);
            const [updated] = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.id, parcel.id));
            expect(updated.pickup_date_time_earliest).toEqual(targetTime);
        });

        it("allows a bulk time-only move on an already over-capacity date", async () => {
            const db = await getTestDb();
            const firstHousehold = await createTestHousehold();
            const secondHousehold = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 1,
            });
            const originalTime = nextMonday10am();
            const firstParcel = await createTestParcel({
                household_id: firstHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: originalTime,
                pickup_date_time_latest: new Date(originalTime.getTime() + 15 * 60 * 1000),
            });
            const secondTime = new Date(originalTime);
            secondTime.setHours(9, 0, 0, 0);
            const secondParcel = await createTestParcel({
                household_id: secondHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: secondTime,
                pickup_date_time_latest: new Date(secondTime.getTime() + 15 * 60 * 1000),
            });
            const targetTime = new Date(originalTime);
            targetTime.setHours(11, 0, 0, 0);

            const result = await bulkRescheduleParcels([firstParcel.id, secondParcel.id], {
                startTime: targetTime,
            });

            expect(result).toMatchObject({ success: true, data: { count: 2 } });
            const updated = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.pickup_location_id, location.id));
            expect(updated).toHaveLength(2);
            expect(
                updated.every(
                    parcel => parcel.pickup_date_time_earliest.getTime() === targetTime.getTime(),
                ),
            ).toBe(true);
        });

        it("should use a date-specific limit instead of the location default", async () => {
            const db = await getTestDb();
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 10,
            });
            const targetTime = nextMonday10am();

            await db.insert(pickupLocationDailyLimits).values({
                pickup_location_id: location.id,
                date: stockholmDateKey(targetTime),
                max_parcels: 1,
            });
            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: targetTime,
                pickup_date_time_latest: new Date(targetTime.getTime() + 15 * 60 * 1000),
            });

            const sourceTime = daysFromTestNow(3);
            sourceTime.setHours(10, 0, 0, 0);
            const toMove = await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sourceTime,
            });

            const result = await bulkRescheduleParcels([toMove.id], {
                startTime: targetTime,
            });

            expect(result).toMatchObject({
                success: false,
                error: expect.objectContaining({ code: "CAPACITY_EXCEEDED" }),
            });
        });
    });

    describe("Opening hours validation", () => {
        it("should reject a single reschedule outside opening hours", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { openingTime: "09:00", closingTime: "12:00" },
            );
            const sourceTime = daysFromTestNow(3);
            sourceTime.setHours(10, 0, 0, 0);
            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: sourceTime,
                pickup_date_time_latest: new Date(sourceTime.getTime() + 15 * 60 * 1000),
            });
            const outsideTime = nextMonday10am();
            outsideTime.setHours(14, 0, 0, 0);

            const result = await updateFoodParcelSchedule(parcel.id, {
                date: outsideTime,
                startTime: outsideTime,
                endTime: new Date(outsideTime.getTime() + 15 * 60 * 1000),
            });

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                error: expect.objectContaining({ code: "OUTSIDE_OPERATING_HOURS" }),
            });
        });

        it("should reject when target time is outside opening hours", async () => {
            const h1 = await createTestHousehold();
            // Location open Mon-Fri 9:00-12:00
            const { location } = await createTestLocationWithSchedule(
                {},
                { openingTime: "09:00", closingTime: "12:00" },
            );

            const tue = daysFromTestNow(3);
            tue.setHours(10, 0, 0, 0);
            const parcel = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tue,
            });

            // Try to reschedule to 14:00 (outside 9-12 hours)
            const outsideTime = nextMonday10am();
            outsideTime.setHours(14, 0, 0, 0);

            const result = await bulkRescheduleParcels([parcel.id], {
                startTime: outsideTime,
            });

            expect(result.success).toBe(false);
            expect(result).toMatchObject({
                error: expect.objectContaining({ code: "VALIDATION_ERROR" }),
            });
        });
    });

    describe("outside_hours_count recomputation", () => {
        it("should update outside_hours_count after bulk reschedule", async () => {
            const db = await getTestDb();
            const h1 = await createTestHousehold();
            // Location open Mon-Fri 9:00-12:00
            const { location } = await createTestLocationWithSchedule(
                {},
                { openingTime: "09:00", closingTime: "12:00" },
            );

            // Create a parcel at 14:00 Monday (outside 9-12 hours)
            const mon14 = nextMonday10am();
            mon14.setHours(14, 0, 0, 0);
            const parcel = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: mon14,
                pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
            });

            // Manually set outside_hours_count = 1 (simulating prior recompute)
            await db
                .update(pickupLocations)
                .set({ outside_hours_count: 1 })
                .where(eq(pickupLocations.id, location.id));

            // Reschedule parcel to 10:00 (within hours)
            const result = await bulkRescheduleParcels([parcel.id], {
                startTime: nextMonday10am(),
            });

            expect(result.success).toBe(true);

            // Verify outside_hours_count was recomputed to 0
            const [loc] = await db
                .select({ outsideCount: pickupLocations.outside_hours_count })
                .from(pickupLocations)
                .where(eq(pickupLocations.id, location.id));

            expect(loc.outsideCount).toBe(0);
        });
    });
});
