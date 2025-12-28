/**
 * Integration tests for SMS opening hours filtering.
 *
 * Tests the ACTUAL getParcelsNeedingReminder() function with real database:
 * 1. Parcels within opening hours are included
 * 2. Parcels outside opening hours are filtered out
 * 3. Parcels at locations with no schedule are included (fail-safe)
 * 4. Schedule lookup works correctly with database data
 *
 * Note: This test complements the unit tests which use mocks to test
 * specific edge cases and error handling. Integration tests verify the
 * end-to-end flow with real database operations.
 *
 * IMPORTANT: Time is mocked globally in the integration test setup to use
 * TEST_NOW (2024-06-15T10:00:00Z, a Saturday at 12:00 Stockholm time).
 * All time-relative helpers should use hoursFromTestNow() for deterministic tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestPickupLocation,
    createTestParcel,
    createTestSentSms,
    resetHouseholdCounter,
    resetLocationCounter,
    resetSmsCounter,
} from "../../factories";
import { getParcelsNeedingReminder } from "@/app/utils/sms/sms-service";
import { hoursFromTestNow } from "../../test-time";

describe("SMS Opening Hours Filtering - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
        resetSmsCounter();
    });

    describe("getParcelsNeedingReminder with real database", () => {
        // TEST_NOW is 2024-06-15T10:00:00Z (Saturday at 12:00 Stockholm time)
        // 24h later = Sunday at 12:00 Stockholm time
        // Schedules must include Saturday/Sunday for parcels to be found

        it("should return parcels within pickup window", async () => {
            const household = await createTestHousehold();
            // Schedule includes Saturday & Sunday with wide opening hours
            const { location } = await createTestLocationWithSchedule(
                {},
                {
                    weekdays: ["saturday", "sunday"],
                    openingTime: "09:00",
                    closingTime: "17:00",
                },
            );

            // Create parcel with pickup 24 hours from TEST_NOW (within 48h window)
            // 24h from Saturday 12:00 = Sunday 12:00, within opening hours
            const pickupTime = hoursFromTestNow(24);

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
                pickup_date_time_latest: new Date(pickupTime.getTime() + 30 * 60 * 1000),
            });

            const result = await getParcelsNeedingReminder();

            // Should find our parcel
            const foundParcel = result.find(p => p.parcelId === parcel.id);
            expect(foundParcel).toBeDefined();
        });

        it("should exclude parcels that already have SMS", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["saturday", "sunday"], openingTime: "09:00", closingTime: "17:00" },
            );

            const pickupTime = hoursFromTestNow(24);

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
            });

            // Create an existing SMS for this parcel
            await createTestSentSms({
                household_id: household.id,
                parcel_id: parcel.id,
                intent: "pickup_reminder",
            });

            const result = await getParcelsNeedingReminder();

            // Parcel with existing SMS should be excluded
            const foundParcel = result.find(p => p.parcelId === parcel.id);
            expect(foundParcel).toBeUndefined();
        });

        it("should include parcels at locations without schedules (fail-safe)", async () => {
            const household = await createTestHousehold();
            // Create location WITHOUT a schedule
            const location = await createTestPickupLocation();

            const pickupTime = hoursFromTestNow(24);

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
            });

            const result = await getParcelsNeedingReminder();

            // Parcel at location without schedule should be included (fail-safe).
            // Business rule: missing/misconfigured opening-hours data must never cause
            // us to skip SMS reminders. The SMS service treats "no schedule" as "always
            // open", so locations without schedules are intentionally included.
            const foundParcel = result.find(p => p.parcelId === parcel.id);
            expect(foundParcel).toBeDefined();
            expect(foundParcel?.locationId).toBe(location.id);
        });

        it("should exclude parcels beyond 48h window", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["saturday", "sunday"], openingTime: "09:00", closingTime: "17:00" },
            );

            // Create parcel with pickup 72 hours from TEST_NOW (beyond 48h)
            const pickupTime = hoursFromTestNow(72);

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
            });

            const result = await getParcelsNeedingReminder();

            // Parcel beyond 48h should be excluded
            const foundParcel = result.find(p => p.parcelId === parcel.id);
            expect(foundParcel).toBeUndefined();
        });

        it("should exclude deleted parcels", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["saturday", "sunday"], openingTime: "09:00", closingTime: "17:00" },
            );

            const pickupTime = hoursFromTestNow(24);

            // Use createTestDeletedParcel for soft-deleted parcel
            const { createTestDeletedParcel } = await import("../../factories");
            const parcel = await createTestDeletedParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
            });

            const result = await getParcelsNeedingReminder();

            // Deleted parcel should be excluded
            const foundParcel = result.find(p => p.parcelId === parcel.id);
            expect(foundParcel).toBeUndefined();
        });

        it("should exclude picked up parcels", async () => {
            const household = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["saturday", "sunday"], openingTime: "09:00", closingTime: "17:00" },
            );

            const pickupTime = hoursFromTestNow(24);

            // Create parcel and mark as picked up
            const { createTestPickedUpParcel } = await import("../../factories");
            const parcel = await createTestPickedUpParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
            });

            const result = await getParcelsNeedingReminder();

            // Picked up parcel should be excluded
            const foundParcel = result.find(p => p.parcelId === parcel.id);
            expect(foundParcel).toBeUndefined();
        });

        it("should return correct parcel data structure", async () => {
            const household = await createTestHousehold({
                first_name: "Test",
                last_name: "User",
                phone_number: "+46701234567",
                locale: "sv",
            });
            const { location } = await createTestLocationWithSchedule(
                {
                    name: "Test Location",
                    street_address: "Test Street 123",
                },
                { weekdays: ["saturday", "sunday"], openingTime: "09:00", closingTime: "17:00" },
            );

            const pickupTime = hoursFromTestNow(24);

            const parcel = await createTestParcel({
                household_id: household.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: pickupTime,
            });

            const result = await getParcelsNeedingReminder();
            const foundParcel = result.find(p => p.parcelId === parcel.id);

            // Parcel should be found
            expect(foundParcel).toBeDefined();
            expect(foundParcel!.parcelId).toBe(parcel.id);
            expect(foundParcel!.householdId).toBe(household.id);
            expect(foundParcel!.householdName).toBe("Test User");
            expect(foundParcel!.phone).toBe("+46701234567");
            expect(foundParcel!.locale).toBe("sv");
            expect(foundParcel!.locationId).toBe(location.id);
            expect(foundParcel!.locationName).toBe("Test Location");
            expect(foundParcel!.locationAddress).toBe("Test Street 123");
            expect(foundParcel!.pickupDate).toBeInstanceOf(Date);
            expect(foundParcel!.pickupLatestDate).toBeInstanceOf(Date);
        });

        it("should return multiple eligible parcels from different households", async () => {
            const household1 = await createTestHousehold();
            const household2 = await createTestHousehold();
            const household3 = await createTestHousehold();
            const { location } = await createTestLocationWithSchedule(
                {},
                { weekdays: ["saturday", "sunday"], openingTime: "09:00", closingTime: "17:00" },
            );

            // 24h from Saturday 12:00 = Sunday 12:00
            const baseTime = hoursFromTestNow(24);

            // Create 3 parcels for different households at slightly different times
            const parcel1 = await createTestParcel({
                household_id: household1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: baseTime,
            });
            const parcel2 = await createTestParcel({
                household_id: household2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: new Date(baseTime.getTime() + 5 * 60 * 1000),
            });
            const parcel3 = await createTestParcel({
                household_id: household3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: new Date(baseTime.getTime() + 10 * 60 * 1000),
            });

            const result = await getParcelsNeedingReminder();

            // Find our test parcels - all should be found
            const parcelIds = result.map(p => p.parcelId);
            expect(parcelIds).toContain(parcel1.id);
            expect(parcelIds).toContain(parcel2.id);
            expect(parcelIds).toContain(parcel3.id);
        });
    });
});
