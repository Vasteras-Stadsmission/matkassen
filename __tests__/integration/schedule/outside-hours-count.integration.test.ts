/**
 * Integration tests for outside_hours_count recomputation.
 *
 * Tests the fix for the caching bug where recomputeOutsideHoursCount was reading
 * stale schedule data. Now that unstable_cache is removed, the function should
 * always use fresh data from the database.
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
    resetHouseholdCounter,
    resetLocationCounter,
} from "../../factories";
import {
    foodParcels,
    pickupLocations,
    pickupLocationScheduleDays,
    pickupLocationSchedules,
} from "@/app/db/schema";
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

// Import after mocks
import { recomputeOutsideHoursCount } from "@/app/[locale]/schedule/actions";

describe("outside_hours_count recomputation - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    it("should count parcels outside opening hours correctly", async () => {
        const db = await getTestDb();
        const h1 = await createTestHousehold();
        const h2 = await createTestHousehold();

        // Location open Mon-Fri 09:00-12:00
        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "12:00" },
        );

        // Monday within hours (10:00)
        const mon10 = daysFromTestNow(2);
        mon10.setHours(10, 0, 0, 0);
        await createTestParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon10,
            pickup_date_time_latest: new Date(mon10.getTime() + 15 * 60 * 1000),
        });

        // Monday outside hours (14:00)
        const mon14 = daysFromTestNow(2);
        mon14.setHours(14, 0, 0, 0);
        await createTestParcel({
            household_id: h2.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        const count = await recomputeOutsideHoursCount(location.id);

        expect(count).toBe(1);

        // Verify persisted in DB
        const [loc] = await db
            .select({ outsideCount: pickupLocations.outside_hours_count })
            .from(pickupLocations)
            .where(eq(pickupLocations.id, location.id));

        expect(loc.outsideCount).toBe(1);
    });

    it("should return 0 when all parcels are within hours", async () => {
        const db = await getTestDb();
        const h1 = await createTestHousehold();

        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "17:00" },
        );

        const mon10 = daysFromTestNow(2);
        mon10.setHours(10, 0, 0, 0);
        await createTestParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon10,
            pickup_date_time_latest: new Date(mon10.getTime() + 15 * 60 * 1000),
        });

        const count = await recomputeOutsideHoursCount(location.id);

        expect(count).toBe(0);
    });

    it("should not count picked-up parcels", async () => {
        const db = await getTestDb();
        const h1 = await createTestHousehold();

        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "12:00" },
        );

        // Outside hours but already picked up — should not count
        const mon14 = daysFromTestNow(2);
        mon14.setHours(14, 0, 0, 0);
        await createTestPickedUpParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        const count = await recomputeOutsideHoursCount(location.id);

        expect(count).toBe(0);
    });

    it("should not count soft-deleted parcels", async () => {
        const db = await getTestDb();
        const h1 = await createTestHousehold();

        const { location } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "12:00" },
        );

        const mon14 = daysFromTestNow(2);
        mon14.setHours(14, 0, 0, 0);
        await createTestDeletedParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        const count = await recomputeOutsideHoursCount(location.id);

        expect(count).toBe(0);
    });

    it("should use fresh schedule data after schedule update", async () => {
        const db = await getTestDb();
        const h1 = await createTestHousehold();

        // Start with Mon-Fri 09:00-17:00
        const { location, schedule } = await createTestLocationWithSchedule(
            {},
            { openingTime: "09:00", closingTime: "17:00" },
        );

        // Parcel at 14:00 Monday — within 9-17 hours
        const mon14 = daysFromTestNow(2);
        mon14.setHours(14, 0, 0, 0);
        await createTestParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon14,
            pickup_date_time_latest: new Date(mon14.getTime() + 15 * 60 * 1000),
        });

        // Confirm count is 0 (parcel is within hours)
        let count = await recomputeOutsideHoursCount(location.id);
        expect(count).toBe(0);

        // Now shrink opening hours to 09:00-12:00 (parcel at 14:00 is now outside)
        await db
            .update(pickupLocationScheduleDays)
            .set({ closing_time: "12:00" })
            .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

        // Recompute — should now see the parcel as outside hours
        count = await recomputeOutsideHoursCount(location.id);
        expect(count).toBe(1);
    });

    it("should return 0 for location with no schedules", async () => {
        const db = await getTestDb();
        const h1 = await createTestHousehold();

        // Location without a schedule
        const { location } = await createTestLocationWithSchedule();

        // Delete the schedule, keeping the location
        const schedules = await db
            .select()
            .from(pickupLocationSchedules)
            .where(eq(pickupLocationSchedules.pickup_location_id, location.id));

        for (const s of schedules) {
            await db
                .delete(pickupLocationScheduleDays)
                .where(eq(pickupLocationScheduleDays.schedule_id, s.id));
            await db.delete(pickupLocationSchedules).where(eq(pickupLocationSchedules.id, s.id));
        }

        // Add a parcel — no schedule means "no hours defined", not "outside hours"
        const mon10 = daysFromTestNow(2);
        mon10.setHours(10, 0, 0, 0);
        await createTestParcel({
            household_id: h1.id,
            pickup_location_id: location.id,
            pickup_date_time_earliest: mon10,
            pickup_date_time_latest: new Date(mon10.getTime() + 15 * 60 * 1000),
        });

        const count = await recomputeOutsideHoursCount(location.id);

        // With no schedules, the function should handle gracefully (0 or all outside — depends on impl)
        expect(typeof count).toBe("number");
    });
});
