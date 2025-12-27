/**
 * Integration tests for parcel warning utilities.
 *
 * Tests the ACTUAL database query behavior:
 * 1. getParcelWarningThreshold() reads from global_settings table
 * 2. getHouseholdParcelCount() counts parcels excluding soft-deleted
 * 3. shouldShowParcelWarning() combines both and returns correct warning
 *
 * Note: Pure logic tests (threshold comparison, parsing) remain in unit tests.
 * These integration tests verify the database operations work correctly.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestParcel,
    createTestDeletedParcel,
    createTestParcelWarningThreshold,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { daysFromTestNow, hoursFromTestNow } from "../../test-time";
import {
    getParcelWarningThreshold,
    getHouseholdParcelCount,
    shouldShowParcelWarning,
} from "@/app/utils/parcel-warnings";

describe("Parcel Warning Utilities - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    describe("getParcelWarningThreshold", () => {
        it("should return null when no threshold is set", async () => {
            // No global setting created
            const result = await getParcelWarningThreshold();
            expect(result).toBeNull();
        });

        it("should return threshold value when set", async () => {
            await createTestParcelWarningThreshold(10);

            const result = await getParcelWarningThreshold();
            expect(result).toBe(10);
        });

        it("should return null when set to 0 (treated as disabled)", async () => {
            // Zero threshold would mean "warn for every household" which is not useful
            // So it's treated as disabled (null)
            await createTestParcelWarningThreshold(0);

            const result = await getParcelWarningThreshold();
            expect(result).toBe(null);
        });
    });

    describe("getHouseholdParcelCount", () => {
        it("should return 0 when household has no parcels", async () => {
            const household = await createTestHousehold();

            const count = await getHouseholdParcelCount(household.id);
            expect(count).toBe(0);
        });

        it("should count all active parcels for household", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create 3 parcels at different times (1 hour apart, starting 1 day from TEST_NOW)
            for (let i = 0; i < 3; i++) {
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 + i),
                });
            }

            const count = await getHouseholdParcelCount(household.id);
            expect(count).toBe(3);
        });

        it("should exclude soft-deleted parcels from count", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create 2 active parcels at different times
            for (let i = 0; i < 2; i++) {
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 + i),
                });
            }

            // Create 1 deleted parcel (should NOT be counted)
            await createTestDeletedParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: hoursFromTestNow(24 + 5),
            });

            const count = await getHouseholdParcelCount(household.id);
            expect(count).toBe(2);
        });

        it("should only count parcels for specified household", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create 3 parcels for household1 at different times
            for (let i = 0; i < 3; i++) {
                await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 + i),
                });
            }

            // Create 1 parcel for household2
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: hoursFromTestNow(24 + 4),
            });

            const count1 = await getHouseholdParcelCount(household1.id);
            const count2 = await getHouseholdParcelCount(household2.id);

            expect(count1).toBe(3);
            expect(count2).toBe(1);
        });

        it("should return 0 for non-existent household", async () => {
            const count = await getHouseholdParcelCount("non-existent-id");
            expect(count).toBe(0);
        });
    });

    describe("shouldShowParcelWarning", () => {
        it("should return shouldWarn=false when no threshold is set", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create 15 parcels at distinct pickup times.
            // We spread them across days and hours to avoid time collisions with
            // the (date,time) unique constraint used in the database.
            for (let i = 0; i < 15; i++) {
                // After every 8 parcels, move to the next day (8 parcels per day).
                // Within a day, assign parcels to different hours.
                const dayOffset = Math.floor(i / 8);
                const hourOffset = i % 8;
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 * (1 + dayOffset) + hourOffset),
                });
            }

            const result = await shouldShowParcelWarning(household.id);

            expect(result.shouldWarn).toBe(false);
            expect(result.parcelCount).toBe(15);
            expect(result.threshold).toBeNull();
        });

        it("should return shouldWarn=false when parcel count equals threshold", async () => {
            await createTestParcelWarningThreshold(5);
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create exactly 5 parcels (equals threshold)
            for (let i = 0; i < 5; i++) {
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 + i),
                });
            }

            const result = await shouldShowParcelWarning(household.id);

            expect(result.shouldWarn).toBe(false);
            expect(result.parcelCount).toBe(5);
            expect(result.threshold).toBe(5);
        });

        it("should return shouldWarn=true when parcel count exceeds threshold", async () => {
            await createTestParcelWarningThreshold(5);
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create 6 parcels (exceeds threshold of 5)
            for (let i = 0; i < 6; i++) {
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 + i),
                });
            }

            const result = await shouldShowParcelWarning(household.id);

            expect(result.shouldWarn).toBe(true);
            expect(result.parcelCount).toBe(6);
            expect(result.threshold).toBe(5);
        });

        it("should return shouldWarn=false when parcel count is below threshold", async () => {
            await createTestParcelWarningThreshold(10);
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create 5 parcels (below threshold of 10)
            for (let i = 0; i < 5; i++) {
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 + i),
                });
            }

            const result = await shouldShowParcelWarning(household.id);

            expect(result.shouldWarn).toBe(false);
            expect(result.parcelCount).toBe(5);
            expect(result.threshold).toBe(10);
        });

        it("should exclude deleted parcels when checking warning (regression)", async () => {
            await createTestParcelWarningThreshold(5);
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            // Create 4 active parcels at different times
            for (let i = 0; i < 4; i++) {
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 + i),
                });
            }

            // Create 3 deleted parcels at different times (should not count toward total)
            for (let i = 0; i < 3; i++) {
                await createTestDeletedParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: hoursFromTestNow(24 + 5 + i),
                });
            }

            const result = await shouldShowParcelWarning(household.id);

            // Only 4 active parcels, which is below threshold of 5
            expect(result.shouldWarn).toBe(false);
            expect(result.parcelCount).toBe(4);
            expect(result.threshold).toBe(5);
        });
    });
});
