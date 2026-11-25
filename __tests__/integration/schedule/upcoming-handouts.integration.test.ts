/**
 * Integration tests for the Schedule hub's look-ahead: the next handout days
 * per pickup location, with booked parcels and the day's limit.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestHousehold,
    createTestLocationWithSchedule,
    createTestPickupLocation,
    createTestParcel,
    createTestDeletedParcel,
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import { daysFromTestNow } from "../../test-time";
import { pickupLocationDailyLimits } from "@/app/db/schema";

type MockSession = { user: { githubUsername: string; name: string; role: "admin" } };
const mockSession: MockSession = {
    user: { githubUsername: "test-admin", name: "Test Admin", role: "admin" },
};

vi.mock("@/app/utils/auth/protected-action", () => {
    const passThrough =
        (fn: (...args: unknown[]) => unknown) =>
        async (...args: unknown[]) =>
            fn(mockSession, ...args);
    return {
        protectedAdminAction: passThrough,
        protectedReadAction: passThrough,
        protectedAgreementReadAction: passThrough,
        protectedAdminAgreementReadAction: passThrough,
        protectedAgreementAction: passThrough,
    };
});

vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Map([["x-locale", "sv"]])),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

import { getUpcomingHandouts } from "@/app/[locale]/schedule/actions";

// TEST_NOW is Saturday 2024-06-15 10:00 UTC, so tomorrow is Sunday 2024-06-16.
function atTen(daysFromNow: number) {
    const d = daysFromTestNow(daysFromNow);
    d.setUTCHours(10, 0, 0, 0);
    return d;
}

describe("getUpcomingHandouts", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("lists the next two open days from tomorrow with booked parcels and the daily limit", async () => {
        const { location } = await createTestLocationWithSchedule({ parcels_max_per_day: 20 });
        const household = await createTestHousehold();
        const other = await createTestHousehold();

        // Today is not part of the look-ahead
        await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: atTen(0),
        });
        // Monday: one active, one soft-deleted
        await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: atTen(2),
        });
        await createTestDeletedParcel({
            household_id: other.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: atTen(2),
        });

        const result = await getUpcomingHandouts();

        expect(result[location.id]).toEqual([
            { date: "2024-06-17", booked: 1, limit: 20 },
            { date: "2024-06-18", booked: 0, limit: 20 },
        ]);
    });

    it("includes a closed day that has bookings", async () => {
        const { location } = await createTestLocationWithSchedule({}, { weekdays: ["wednesday"] });
        const household = await createTestHousehold();
        await createTestParcel({
            household_id: household.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: atTen(1),
        });

        const result = await getUpcomingHandouts();

        expect(result[location.id]).toEqual([
            { date: "2024-06-16", booked: 1, limit: null },
            { date: "2024-06-19", booked: 0, limit: null },
        ]);
    });

    it("uses the date's own limit when one is set", async () => {
        const { location } = await createTestLocationWithSchedule(
            { parcels_max_per_day: 20 },
            { weekdays: ["monday"] },
        );
        const db = await getTestDb();
        await db.insert(pickupLocationDailyLimits).values({
            pickup_location_id: location.id,
            date: "2024-06-17",
            max_parcels: 5,
        });

        const result = await getUpcomingHandouts();

        expect(result[location.id]).toEqual([
            { date: "2024-06-17", booked: 0, limit: 5 },
            { date: "2024-06-24", booked: 0, limit: 20 },
        ]);
    });

    it("looks 14 days ahead and no further", async () => {
        // Schedule starts Friday 2024-06-28, so the open Saturdays are day 14
        // (2024-06-29) and day 21 (2024-07-06).
        const { location } = await createTestLocationWithSchedule(
            {},
            {
                weekdays: ["saturday"],
                startDate: daysFromTestNow(13),
                endDate: daysFromTestNow(60),
            },
        );

        const result = await getUpcomingHandouts();

        expect(result[location.id].map(h => h.date)).toEqual(["2024-06-29"]);
    });

    it("returns no handouts for a location without opening hours", async () => {
        const location = await createTestPickupLocation();

        const result = await getUpcomingHandouts();

        expect(result[location.id]).toEqual([]);
    });
});
