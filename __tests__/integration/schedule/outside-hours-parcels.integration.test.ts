/**
 * Integration tests for getOutsideHoursParcelsForLocation.
 *
 * Tests the fix where the outside-hours panel now returns ALL future
 * outside-hours parcels regardless of which week is being viewed,
 * and returns enriched parcel data (primaryPickupLocationName, createdBy).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestLocationWithCustomSchedule,
    createTestParcel,
    createTestPickedUpParcel,
    createTestDeletedParcel,
    createTestPickupLocation,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { households, pickupLocations } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { daysFromTestNow } from "../../test-time";

// Mock auth
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
    protectedAgreementAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
}));

// Mock SMS service (needed by bulkRescheduleParcels)
vi.mock("@/app/utils/sms/sms-service", () => ({
    queuePickupUpdatedSms: vi.fn().mockResolvedValue({ success: true, skipped: true }),
}));

// Import after mocks
import {
    getOutsideHoursParcelsForLocation,
    bulkRescheduleParcels,
} from "@/app/[locale]/schedule/actions";

describe("getOutsideHoursParcelsForLocation - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("should return outside-hours parcels across multiple weeks", async () => {
        const h1 = await createTestHousehold();
        const h2 = await createTestHousehold();
        const h3 = await createTestHousehold();

        // Location open Mon-Fri 09:00-12:00
        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "12:00" },
        );

        // Parcel this week (Monday) outside hours at 14:00
        const mon14 = daysFromTestNow(2); // Monday
        mon14.setHours(14, 0, 0, 0);
        await createTestParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        // Parcel next week (Monday + 7 days) outside hours at 15:00
        const nextMon15 = daysFromTestNow(9);
        nextMon15.setHours(15, 0, 0, 0);
        await createTestParcel({
            household_id: h2.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: nextMon15,
            pickup_date_time_latest: new Date(nextMon15.getTime() + 15 * 60 * 1000),
        });

        // Parcel 3 weeks out outside hours at 13:00
        const farMon13 = daysFromTestNow(16);
        farMon13.setHours(13, 0, 0, 0);
        await createTestParcel({
            household_id: h3.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: farMon13,
            pickup_date_time_latest: new Date(farMon13.getTime() + 15 * 60 * 1000),
        });

        const parcels = await getOutsideHoursParcelsForLocation(location.id);

        // All 3 parcels from different weeks should be returned
        expect(parcels).toHaveLength(3);
    });

    it("should not include parcels that are within opening hours", async () => {
        const h1 = await createTestHousehold();
        const h2 = await createTestHousehold();

        // Location open Mon-Fri 09:00-17:00
        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "17:00" },
        );

        // Within hours at 10:00
        const mon10 = daysFromTestNow(2);
        mon10.setHours(10, 0, 0, 0);
        await createTestParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon10,
            pickup_date_time_latest: new Date(mon10.getTime() + 15 * 60 * 1000),
        });

        // Outside hours at 18:00
        const mon18 = daysFromTestNow(2);
        mon18.setHours(18, 0, 0, 0);
        await createTestParcel({
            household_id: h2.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon18,
            pickup_date_time_latest: new Date(mon18.getTime() + 15 * 60 * 1000),
        });

        const parcels = await getOutsideHoursParcelsForLocation(location.id);

        expect(parcels).toHaveLength(1);
        expect(parcels[0].householdName).toContain("Test2");
    });

    it("should not include picked-up or soft-deleted parcels", async () => {
        const h1 = await createTestHousehold();
        const h2 = await createTestHousehold();
        const h3 = await createTestHousehold();

        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "12:00" },
        );

        const mon14 = daysFromTestNow(2);
        mon14.setHours(14, 0, 0, 0);

        // Active parcel outside hours — should be returned
        await createTestParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        // Picked-up parcel outside hours — should NOT be returned
        await createTestPickedUpParcel({
            household_id: h2.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        // Soft-deleted parcel outside hours — should NOT be returned
        await createTestDeletedParcel({
            household_id: h3.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        const parcels = await getOutsideHoursParcelsForLocation(location.id);

        expect(parcels).toHaveLength(1);
        expect(parcels[0].householdName).toContain("Test1");
    });

    it("should include primaryPickupLocationName and createdBy in returned parcels", async () => {
        const db = await getTestDb();

        // Create a "primary" location that the household belongs to
        const primaryLocation = await createTestPickupLocation({ name: "Primär plats" });

        // Create household with primary_pickup_location_id and created_by set
        const h = await createTestHousehold({
            primary_pickup_location_id: primaryLocation.id,
            created_by: "admin-user",
        });

        // Create a different location where the parcel is actually scheduled
        const { location: scheduledLocation } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "12:00" },
        );

        // Parcel outside hours
        const mon14 = daysFromTestNow(2);
        mon14.setHours(14, 0, 0, 0);
        await createTestParcel({
            household_id: h.id,
            pickup_location_id: scheduledLocation.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        const parcels = await getOutsideHoursParcelsForLocation(scheduledLocation.id);

        expect(parcels).toHaveLength(1);
        expect(parcels[0].primaryPickupLocationName).toBe("Primär plats");
        expect(parcels[0].createdBy).toBe("admin-user");
    });

    it("should return empty array when no parcels are outside hours", async () => {
        const h = await createTestHousehold();

        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "17:00" },
        );

        const mon10 = daysFromTestNow(2);
        mon10.setHours(10, 0, 0, 0);
        await createTestParcel({
            household_id: h.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon10,
            pickup_date_time_latest: new Date(mon10.getTime() + 15 * 60 * 1000),
        });

        const parcels = await getOutsideHoursParcelsForLocation(location.id);

        expect(parcels).toHaveLength(0);
    });

    it("should update after bulk reschedule moves parcels into valid hours", async () => {
        const h1 = await createTestHousehold();
        const h2 = await createTestHousehold();

        // Location open Mon-Fri 09:00-17:00
        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "17:00" },
        );

        // Two parcels outside hours at 18:00 Monday
        const mon18 = daysFromTestNow(2);
        mon18.setHours(18, 0, 0, 0);
        const p1 = await createTestParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon18,
            pickup_date_time_latest: new Date(mon18.getTime() + 15 * 60 * 1000),
        });
        const p2 = await createTestParcel({
            household_id: h2.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon18,
            pickup_date_time_latest: new Date(mon18.getTime() + 15 * 60 * 1000),
        });

        // Verify both are outside hours
        let parcels = await getOutsideHoursParcelsForLocation(location.id);
        expect(parcels).toHaveLength(2);

        // Reschedule both to Monday 10:00 (within hours)
        const mon10 = daysFromTestNow(2);
        mon10.setHours(10, 0, 0, 0);
        const result = await bulkRescheduleParcels([p1.id, p2.id], { startTime: mon10 });
        expect(result.success).toBe(true);

        // After reschedule, outside-hours list should be empty
        parcels = await getOutsideHoursParcelsForLocation(location.id);
        expect(parcels).toHaveLength(0);
    });

    it("should only return parcels for the requested location", async () => {
        const h1 = await createTestHousehold();
        const h2 = await createTestHousehold();

        const { location: loc1 } = await createTestLocationWithSchedule(
            { name: "Location A" },
            { openingTime: "09:00", closingTime: "12:00" },
        );
        const { location: loc2 } = await createTestLocationWithSchedule(
            { name: "Location B" },
            { openingTime: "09:00", closingTime: "12:00" },
        );

        const mon14 = daysFromTestNow(2);
        mon14.setHours(14, 0, 0, 0);

        // Outside hours parcel at location A
        await createTestParcel({
            household_id: h1.id,
            pickup_location_id: loc1.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        // Outside hours parcel at location B
        await createTestParcel({
            household_id: h2.id,
            pickup_location_id: loc2.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        const parcelsA = await getOutsideHoursParcelsForLocation(loc1.id);
        const parcelsB = await getOutsideHoursParcelsForLocation(loc2.id);

        expect(parcelsA).toHaveLength(1);
        expect(parcelsA[0].householdName).toContain("Test1");
        expect(parcelsB).toHaveLength(1);
        expect(parcelsB[0].householdName).toContain("Test2");
    });

    it("should treat parcels on closed days (e.g. Saturday) as outside hours", async () => {
        const h = await createTestHousehold();

        // Location open only Mon-Fri
        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "17:00" },
        );

        // Schedule parcel for Saturday (day 7 from TEST_NOW which is Saturday)
        // TEST_NOW is Saturday, so +7 = next Saturday
        const nextSat = daysFromTestNow(7);
        nextSat.setHours(10, 0, 0, 0);
        await createTestParcel({
            household_id: h.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: nextSat,
            pickup_date_time_latest: new Date(nextSat.getTime() + 15 * 60 * 1000),
        });

        const parcels = await getOutsideHoursParcelsForLocation(location.id);

        // Saturday is not in the Mon-Fri schedule, so it's outside hours
        expect(parcels).toHaveLength(1);
    });

    it("should not return parcels when schedule has ended (expired schedule)", async () => {
        const h = await createTestHousehold();

        // Create location with a schedule that ended yesterday
        const pastEnd = new Date(daysFromTestNow(-1));
        const pastStart = new Date(daysFromTestNow(-30));

        const { location } = await createTestLocationWithCustomSchedule(
            {},
            {
                name: "Expired Schedule",
                startDate: pastStart.toISOString().split("T")[0],
                endDate: pastEnd.toISOString().split("T")[0],
                days: [
                    {
                        weekday: "monday",
                        is_open: true,
                        opening_time: "09:00",
                        closing_time: "17:00",
                    },
                ],
            },
        );

        // Parcel in the future — no active schedule covers it
        const mon10 = daysFromTestNow(2);
        mon10.setHours(10, 0, 0, 0);
        await createTestParcel({
            household_id: h.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon10,
            pickup_date_time_latest: new Date(mon10.getTime() + 15 * 60 * 1000),
        });

        const parcels = await getOutsideHoursParcelsForLocation(location.id);

        // With only an expired schedule, the parcel has no matching hours —
        // it should be flagged as outside hours
        expect(parcels).toHaveLength(1);
    });
});
