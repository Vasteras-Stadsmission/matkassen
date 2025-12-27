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

        it("should return threshold of 0 when set to 0", async () => {
            await createTestParcelWarningThreshold(0);

            const result = await getParcelWarningThreshold();
            expect(result).toBe(0);
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

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create 3 parcels at different times
            for (let i = 0; i < 3; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setHours(10 + i, 0, 0, 0);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
                });
            }

            const count = await getHouseholdParcelCount(household.id);
            expect(count).toBe(3);
        });

        it("should exclude soft-deleted parcels from count", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create 2 active parcels at different times
            for (let i = 0; i < 2; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setHours(10 + i, 0, 0, 0);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
                });
            }

            // Create 1 deleted parcel (should NOT be counted)
            const deletedTime = new Date(baseDate);
            deletedTime.setHours(15, 0, 0, 0);
            await createTestDeletedParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: deletedTime,
            });

            const count = await getHouseholdParcelCount(household.id);
            expect(count).toBe(2);
        });

        it("should only count parcels for specified household", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule();

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create 3 parcels for household1 at different times
            for (let i = 0; i < 3; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setHours(10 + i, 0, 0, 0);
                await createTestParcel({
                    household_id: household1.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
                });
            }

            // Create 1 parcel for household2
            const pickupTime2 = new Date(baseDate);
            pickupTime2.setHours(14, 0, 0, 0);
            await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime2,
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

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create many parcels at different times (spread across multiple days)
            for (let i = 0; i < 15; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setDate(pickupTime.getDate() + Math.floor(i / 8)); // Spread across days
                pickupTime.setHours(9 + (i % 8), 0, 0, 0); // Different hours each day
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
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

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create exactly 5 parcels (equals threshold)
            for (let i = 0; i < 5; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setHours(9 + i, 0, 0, 0);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
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

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create 6 parcels (exceeds threshold of 5)
            for (let i = 0; i < 6; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setHours(9 + i, 0, 0, 0);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
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

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create 5 parcels (below threshold of 10)
            for (let i = 0; i < 5; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setHours(9 + i, 0, 0, 0);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
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

            const baseDate = new Date();
            baseDate.setDate(baseDate.getDate() + 1);

            // Create 4 active parcels at different times
            for (let i = 0; i < 4; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setHours(9 + i, 0, 0, 0);
                await createTestParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
                });
            }

            // Create 3 deleted parcels at different times (should not count toward total)
            for (let i = 0; i < 3; i++) {
                const pickupTime = new Date(baseDate);
                pickupTime.setHours(14 + i, 0, 0, 0);
                await createTestDeletedParcel({
                    household_id: household.id,
                    pickup_location_id: location.id,
                    pickup_date_time_earliest: pickupTime,
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
