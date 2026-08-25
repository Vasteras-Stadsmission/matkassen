/**
 * Integration tests for capacity action functions.
 *
 * Tests the ACTUAL functions:
 * - checkPickupLocationCapacity()
 * - getPickupLocationCapacityForRange()
 *
 * Unlike the existing capacity.integration.test.ts which only tests raw SQL,
 * these tests call the real action functions to verify:
 * 1. Soft-deleted parcels are excluded from counts
 * 2. excludeHouseholdId parameter works correctly
 * 3. Date range bucketing is accurate
 * 4. Return shape matches expected format
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestDeletedParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { TEST_NOW, daysFromTestNow, minutesFromTestNow } from "../../test-time";
import { foodParcels, pickupLocationDailyLimits } from "@/app/db/schema";
import { eq } from "drizzle-orm";

vi.mock("@/app/utils/auth/protected-action", () => ({
    protectedReadAction:
        (action: (session: unknown, ...args: unknown[]) => unknown) =>
        (...args: unknown[]) =>
            action({ user: { role: "admin" } }, ...args),
    protectedAdminAction:
        (action: (session: unknown, ...args: unknown[]) => unknown) =>
        (...args: unknown[]) =>
            action({ user: { role: "admin" } }, ...args),
}));

// Import the actual functions we're testing
import {
    checkPickupLocationCapacity,
    getPickupLocationCapacityForRange,
} from "@/app/[locale]/households/enroll/actions";
import { formatDateToISOString, getStockholmDateKey } from "@/app/utils/date-utils";
import {
    validateBulkParcelAssignments,
    validateParcelAssignmentsForForm,
} from "@/app/utils/validation/parcel-assignment";

describe("Capacity Action Functions - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    describe("checkPickupLocationCapacity", () => {
        it("should return available when location has no daily limit", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: null, // No limit
            });

            const result = await checkPickupLocationCapacity(location.id, TEST_NOW);

            expect(result.isAvailable).toBe(true);
            expect(result.maxCount).toBeNull();
            expect(result.message).toContain("Ingen gräns");
        });

        it("should fail closed when location does not exist", async () => {
            const result = await checkPickupLocationCapacity("non-existent-location-id", TEST_NOW);

            expect(result.isAvailable).toBe(false);
            expect(result.maxCount).toBeNull();
        });

        it("should count only non-deleted parcels", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const household3 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 5,
            });

            // Use deterministic test time - 1 day in future
            const testDate = daysFromTestNow(1);

            // Create 2 active parcels
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 30), // 1 day + 30 min
            });

            // Create 1 soft-deleted parcel (should NOT count)
            await createTestDeletedParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 60), // 1 day + 1 hour
            });

            const result = await checkPickupLocationCapacity(location.id, testDate);

            expect(result.isAvailable).toBe(true);
            expect(result.currentCount).toBe(2); // Only active parcels
            expect(result.maxCount).toBe(5);
        });

        it("should show unavailable when at capacity", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });

            const testDate = daysFromTestNow(1);

            // Fill to capacity
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 30), // 1 day + 30 min
            });

            const result = await checkPickupLocationCapacity(location.id, testDate);

            expect(result.isAvailable).toBe(false);
            expect(result.currentCount).toBe(2);
            expect(result.maxCount).toBe(2);
            expect(result.message).toContain("Max antal");
        });

        it("should free up capacity when parcel is soft-deleted (regression)", async () => {
            const db = await getTestDb();
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });

            const testDate = daysFromTestNow(1);

            // Fill to capacity
            const parcel1 = await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 30), // 1 day + 30 min
            });

            // Verify full
            let result = await checkPickupLocationCapacity(location.id, testDate);
            expect(result.isAvailable).toBe(false);

            // Soft-delete one parcel
            await db
                .update(foodParcels)
                .set({ deleted_at: TEST_NOW, deleted_by_user_id: "test-admin" })
                .where(eq(foodParcels.id, parcel1.id));

            // Now should be available again
            result = await checkPickupLocationCapacity(location.id, testDate);
            expect(result.isAvailable).toBe(true);
            expect(result.currentCount).toBe(1);
        });

        it("should return correct message format when available", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 5,
            });

            const testDate = daysFromTestNow(1);

            // Create 1 parcel
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });

            const result = await checkPickupLocationCapacity(location.id, testDate);

            expect(result.isAvailable).toBe(true);
            expect(result.message).toContain("1 av 5"); // "X av Y bokade" format
        });

        it("should exclude specified household from count", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });

            const testDate = daysFromTestNow(1);

            // Both households have parcels
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 30), // 1 day + 30 min
            });

            // Without exclusion: 2 parcels (full)
            let result = await checkPickupLocationCapacity(location.id, testDate);
            expect(result.currentCount).toBe(2);
            expect(result.isAvailable).toBe(false);

            // Excluding household1: only 1 parcel counts
            result = await checkPickupLocationCapacity(location.id, testDate, household1.id);
            expect(result.currentCount).toBe(1);
            expect(result.isAvailable).toBe(true);
        });
    });

    describe("getPickupLocationCapacityForRange", () => {
        it("should return hasLimit=false when location has no daily limit", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: null,
            });

            const startDate = TEST_NOW;
            const endDate = daysFromTestNow(7);

            const result = await getPickupLocationCapacityForRange(location.id, startDate, endDate);

            expect(result.hasLimit).toBe(false);
            expect(result.maxPerDay).toBeNull();
            expect(result.dateLimits).toEqual(
                expect.objectContaining({ [formatDateToISOString(startDate)]: null }),
            );
            expect(result.dateCapacities).toEqual({});
        });

        it("returns and enforces a date-specific limit", async () => {
            const db = await getTestDb();
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 5,
            });
            const testDate = daysFromTestNow(1);
            const dateKey = getStockholmDateKey(testDate);

            await db.insert(pickupLocationDailyLimits).values({
                pickup_location_id: location.id,
                date: dateKey,
                max_parcels: 1,
            });
            await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });

            const single = await checkPickupLocationCapacity(location.id, testDate);
            const range = await getPickupLocationCapacityForRange(location.id, testDate, testDate);

            expect(single.isAvailable).toBe(false);
            expect(single.maxCount).toBe(1);
            expect(range.maxPerDay).toBe(5);
            expect(range.dateLimits[dateKey]).toBe(1);
        });

        it("should bucket parcels by date correctly", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const household3 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 5,
            });

            const day1 = daysFromTestNow(1);
            const day2 = daysFromTestNow(2);

            // 2 parcels on day 1
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: day1,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 30), // day 1 + 30 min
            });

            // 1 parcel on day 2
            await createTestParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: day2,
            });

            const result = await getPickupLocationCapacityForRange(location.id, day1, day2);

            expect(result.hasLimit).toBe(true);
            expect(result.maxPerDay).toBe(5);

            const dateCapacities = result.dateCapacities as Record<string, number>;
            const day1Key = formatDateToISOString(day1);
            const day2Key = formatDateToISOString(day2);

            expect(dateCapacities[day1Key]).toBe(2);
            expect(dateCapacities[day2Key]).toBe(1);
        });

        it("should exclude soft-deleted parcels from range counts", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const household3 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 5,
            });

            const testDate = daysFromTestNow(1);

            // 2 active parcels
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 30), // day 1 + 30 min
            });

            // 1 soft-deleted parcel (should NOT count)
            await createTestDeletedParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 60), // day 1 + 1 hour
            });

            const endDate = daysFromTestNow(2);

            const result = await getPickupLocationCapacityForRange(location.id, testDate, endDate);

            const dateCapacities = result.dateCapacities as Record<string, number>;
            const testDateKey = formatDateToISOString(testDate);

            expect(dateCapacities[testDateKey]).toBe(2); // Only active parcels
        });

        it("should allow rebooking after cancellation (regression)", async () => {
            const db = await getTestDb();
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });

            const testDate = daysFromTestNow(1);

            // Fill to capacity
            const parcel1 = await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 30), // day 1 + 30 min
            });

            const endDate = daysFromTestNow(2);

            // Verify full
            let result = await getPickupLocationCapacityForRange(location.id, testDate, endDate);
            let dateCapacities = result.dateCapacities as Record<string, number>;
            const testDateKey = formatDateToISOString(testDate);
            expect(dateCapacities[testDateKey]).toBe(2);

            // Soft-delete one parcel
            await db
                .update(foodParcels)
                .set({ deleted_at: TEST_NOW, deleted_by_user_id: "test-admin" })
                .where(eq(foodParcels.id, parcel1.id));

            // Now should have capacity again
            result = await getPickupLocationCapacityForRange(location.id, testDate, endDate);
            dateCapacities = result.dateCapacities as Record<string, number>;
            expect(dateCapacities[testDateKey]).toBe(1);
        });
    });

    describe("Consistency between functions", () => {
        it("should report same count for single date and range query", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 5,
            });

            const testDate = daysFromTestNow(1);

            // Create 2 parcels
            await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: testDate,
            });
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: minutesFromTestNow(24 * 60 + 30), // day 1 + 30 min
            });

            // Check single date
            const singleResult = await checkPickupLocationCapacity(location.id, testDate);

            // Check range (just this one date)
            const rangeResult = await getPickupLocationCapacityForRange(
                location.id,
                testDate,
                testDate,
            );
            const dateCapacities = rangeResult.dateCapacities as Record<string, number>;
            const testDateKey = formatDateToISOString(testDate);

            // Both should report 2 parcels
            expect(singleResult.currentCount).toBe(2);
            expect(dateCapacities[testDateKey]).toBe(2);
        });
    });

    describe("multi-row capacity validation", () => {
        it("counts every new row in the request against the remaining capacity", async () => {
            const existingHousehold = await createTestHousehold();
            const firstIncomingHousehold = await createTestHousehold();
            const secondIncomingHousehold = await createTestHousehold();
            const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            start.setUTCHours(10, 0, 0, 0);
            const end = new Date(start.getTime() + 15 * 60 * 1000);
            const { location } = await createTestLocationWithSchedule(
                { parcels_max_per_day: 2, max_parcels_per_slot: null },
                {
                    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                    weekdays: [
                        "monday",
                        "tuesday",
                        "wednesday",
                        "thursday",
                        "friday",
                        "saturday",
                        "sunday",
                    ],
                },
            );
            await createTestParcel({
                household_id: existingHousehold.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: start,
                pickup_date_time_latest: end,
            });

            const result = await validateBulkParcelAssignments(
                [firstIncomingHousehold, secondIncomingHousehold].map((household, index) => ({
                    parcelId: `new-${index}`,
                    householdId: household.id,
                    isNewParcel: true,
                    timeslot: {
                        date: getStockholmDateKey(start),
                        startTime: new Date(start.getTime() + index * 30 * 60 * 1000),
                        endTime: new Date(end.getTime() + index * 30 * 60 * 1000),
                    },
                })),
                location.id,
            );

            expect(result.success).toBe(false);
            expect(result.errors?.map(error => error.code)).toContain("MAX_DAILY_CAPACITY_REACHED");
        });

        it("validates each row against its own pickup location", async () => {
            const household = await createTestHousehold();
            const blockingHousehold = await createTestHousehold();
            const firstDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
            firstDate.setUTCHours(10, 0, 0, 0);
            const secondDate = new Date(firstDate.getTime() + 24 * 60 * 60 * 1000);
            const scheduleOptions = {
                startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                weekdays: [
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                ] as const,
            };
            const { location: availableLocation } = await createTestLocationWithSchedule(
                { parcels_max_per_day: 5, max_parcels_per_slot: null },
                { ...scheduleOptions, weekdays: [...scheduleOptions.weekdays] },
            );
            const { location: fullLocation } = await createTestLocationWithSchedule(
                { parcels_max_per_day: 1, max_parcels_per_slot: null },
                { ...scheduleOptions, weekdays: [...scheduleOptions.weekdays] },
            );
            await createTestParcel({
                household_id: blockingHousehold.id,
                pickup_location_id: fullLocation.id,
                pickup_date_time_earliest: secondDate,
                pickup_date_time_latest: new Date(secondDate.getTime() + 15 * 60 * 1000),
            });

            const result = await validateParcelAssignmentsForForm([
                {
                    householdId: household.id,
                    locationId: availableLocation.id,
                    pickupDate: firstDate,
                    pickupStartTime: firstDate,
                    pickupEndTime: new Date(firstDate.getTime() + 15 * 60 * 1000),
                },
                {
                    householdId: household.id,
                    locationId: fullLocation.id,
                    pickupDate: secondDate,
                    pickupStartTime: secondDate,
                    pickupEndTime: new Date(secondDate.getTime() + 15 * 60 * 1000),
                },
            ]);

            expect(result.success).toBe(false);
            expect(result.errors).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        code: "MAX_DAILY_CAPACITY_REACHED",
                        details: expect.objectContaining({ locationId: fullLocation.id }),
                    }),
                ]),
            );
        });
    });
});
