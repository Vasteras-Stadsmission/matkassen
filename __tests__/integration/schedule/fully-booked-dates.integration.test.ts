/**
 * Integration tests for fully-booked-dates and timeslot-counts functionality.
 *
 * Tests the getFullyBookedDates and getTimeslotCounts server actions against
 * a real (PGlite) database. Covers:
 * - Daily capacity detection (dates at or over max_parcels_per_day)
 * - Soft-deleted parcels excluded from counts
 * - excludeParcelId correctly removes the rescheduled parcel from counts
 * - Timeslot-level counting and slot rounding
 * - Edge cases: null capacity, zero capacity, no parcels
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
import { daysFromTestNow } from "../../test-time";

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
    protectedAgreementAction: (fn: (...args: unknown[]) => unknown) => {
        return async (...args: unknown[]) => {
            return fn(mockSession, ...args);
        };
    },
}));

vi.mock("next/headers", () => ({
    headers: vi.fn().mockResolvedValue(new Map([["x-locale", "sv"]])),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

// Import server actions after mocks
import {
    getFullyBookedDates,
    getTimeslotCounts,
    getLocationSlotConfig,
} from "@/app/[locale]/schedule/actions";

describe("Fully Booked Dates - Integration Tests", () => {
    beforeEach(() => {
        resetHouseholdCounter();
        resetLocationCounter();
    });

    // TEST_NOW is Saturday 2024-06-15 10:00 UTC.
    // Schedules default to Mon-Fri 9-17, so use Monday (daysFromTestNow(2)).
    function nextMonday10am() {
        const d = daysFromTestNow(2);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    function nextTuesday10am() {
        const d = daysFromTestNow(3);
        d.setHours(10, 0, 0, 0);
        return d;
    }

    describe("getFullyBookedDates", () => {
        it("should return dates at daily capacity", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();

            const monday = nextMonday10am();

            // Fill Monday to capacity (2 parcels)
            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday,
            });
            await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday,
            });

            const startDate = daysFromTestNow(1);
            const endDate = daysFromTestNow(10);

            const result = await getFullyBookedDates(location.id, startDate, endDate);

            expect(result).toHaveLength(1);
            expect(result[0]).toBe("2024-06-17"); // Monday
        });

        it("should not return dates below capacity", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 3,
            });
            const h1 = await createTestHousehold();

            const monday = nextMonday10am();

            // Only 1 parcel, capacity is 3
            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday,
            });

            const result = await getFullyBookedDates(
                location.id,
                daysFromTestNow(1),
                daysFromTestNow(10),
            );

            expect(result).toHaveLength(0);
        });

        it("should exclude soft-deleted parcels from count", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();

            const monday = nextMonday10am();

            // 1 active + 1 deleted = only 1 counts toward capacity of 2
            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday,
            });
            await createTestDeletedParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday,
            });

            const result = await getFullyBookedDates(
                location.id,
                daysFromTestNow(1),
                daysFromTestNow(10),
            );

            expect(result).toHaveLength(0); // Only 1/2, not full
        });

        it("should exclude the specified parcel from count (excludeParcelId)", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
            });
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();

            const monday = nextMonday10am();

            const parcel1 = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday,
            });
            await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday,
            });

            // Without exclusion: Monday is full (2/2)
            const withoutExclusion = await getFullyBookedDates(
                location.id,
                daysFromTestNow(1),
                daysFromTestNow(10),
            );
            expect(withoutExclusion).toHaveLength(1);

            // With exclusion: parcel1 excluded, only 1/2 = not full
            const withExclusion = await getFullyBookedDates(
                location.id,
                daysFromTestNow(1),
                daysFromTestNow(10),
                parcel1.id,
            );
            expect(withExclusion).toHaveLength(0);
        });

        it("should return empty array when no daily limit is set (null)", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: null,
            });
            const h1 = await createTestHousehold();

            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: nextMonday10am(),
            });

            const result = await getFullyBookedDates(
                location.id,
                daysFromTestNow(1),
                daysFromTestNow(10),
            );

            expect(result).toHaveLength(0);
        });

        it("should handle multiple dates with mixed capacity", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 1,
            });
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();

            const monday = nextMonday10am();
            const tuesday = nextTuesday10am();

            // Monday: 1 parcel (at capacity of 1)
            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday,
            });

            // Tuesday: no parcels (below capacity)
            // But add a deleted parcel on Tuesday to verify it's excluded
            await createTestDeletedParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: tuesday,
            });

            const result = await getFullyBookedDates(
                location.id,
                daysFromTestNow(1),
                daysFromTestNow(10),
            );

            expect(result).toHaveLength(1);
            expect(result[0]).toBe("2024-06-17"); // Only Monday
        });
    });

    describe("getTimeslotCounts", () => {
        it("should count parcels per time slot", async () => {
            const { location } = await createTestLocationWithSchedule({
                default_slot_duration_minutes: 30,
            });
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();
            const h3 = await createTestHousehold();

            const monday10 = nextMonday10am();
            const monday1030 = new Date(monday10);
            monday1030.setMinutes(30);

            // 2 parcels at 10:00, 1 at 10:30
            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday10,
            });
            await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday10,
            });
            await createTestParcel({
                household_id: h3.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday1030,
            });

            const result = await getTimeslotCounts(location.id, monday10);

            expect(result["10:00"]).toBe(2);
            expect(result["10:30"]).toBe(1);
        });

        it("should exclude soft-deleted parcels from slot counts", async () => {
            const { location } = await createTestLocationWithSchedule({
                default_slot_duration_minutes: 15,
            });
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();

            const monday10 = nextMonday10am();

            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday10,
            });
            await createTestDeletedParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday10,
            });

            const result = await getTimeslotCounts(location.id, monday10);

            expect(result["10:00"]).toBe(1);
        });

        it("should exclude the specified parcel from slot counts (excludeParcelId)", async () => {
            const { location } = await createTestLocationWithSchedule({
                default_slot_duration_minutes: 15,
            });
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();

            const monday10 = nextMonday10am();

            const parcel1 = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday10,
            });
            await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday10,
            });

            // Without exclusion: 2 parcels
            const withoutExclusion = await getTimeslotCounts(location.id, monday10);
            expect(withoutExclusion["10:00"]).toBe(2);

            // With exclusion: 1 parcel
            const withExclusion = await getTimeslotCounts(location.id, monday10, parcel1.id);
            expect(withExclusion["10:00"]).toBe(1);
        });

        it("should return empty record when no parcels exist", async () => {
            const { location } = await createTestLocationWithSchedule();
            const monday = nextMonday10am();

            const result = await getTimeslotCounts(location.id, monday);

            expect(Object.keys(result)).toHaveLength(0);
        });

        it("should round times to correct slot boundaries", async () => {
            const { location } = await createTestLocationWithSchedule({
                default_slot_duration_minutes: 30,
            });
            const h1 = await createTestHousehold();

            // Parcel at 10:15 should be rounded to 10:00 slot (with 30-min duration)
            const monday1015 = nextMonday10am();
            monday1015.setMinutes(15);

            await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday1015,
            });

            const result = await getTimeslotCounts(location.id, monday1015);

            expect(result["10:00"]).toBe(1);
            expect(result["10:15"]).toBeUndefined();
        });
    });

    describe("getLocationSlotConfig", () => {
        it("should return slot duration and max parcels per slot", async () => {
            const { location } = await createTestLocationWithSchedule({
                default_slot_duration_minutes: 30,
                max_parcels_per_slot: 5,
            });

            const result = await getLocationSlotConfig(location.id);

            expect(result.slotDuration).toBe(30);
            expect(result.maxParcelsPerSlot).toBe(5);
        });

        it("should return defaults for non-existent location", async () => {
            const result = await getLocationSlotConfig("non-existent-id");

            expect(result.slotDuration).toBe(15);
            expect(result.maxParcelsPerSlot).toBeNull();
        });
    });

    describe("Reschedule validation with capacity", () => {
        it("REGRESSION: rescheduling within a full day should be allowed (excludeParcelId)", async () => {
            const { location } = await createTestLocationWithSchedule({
                parcels_max_per_day: 2,
                default_slot_duration_minutes: 30,
            });
            const h1 = await createTestHousehold();
            const h2 = await createTestHousehold();

            const monday10 = nextMonday10am();
            const monday1030 = new Date(monday10);
            monday1030.setMinutes(30);

            // Fill Monday to capacity
            const parcelToMove = await createTestParcel({
                household_id: h1.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday10,
            });
            await createTestParcel({
                household_id: h2.id,
                pickup_location_id: location.id,
                pickup_date_time_earliest: monday10,
            });

            // Without excluding the parcel being moved: Monday is full
            const bookedDates = await getFullyBookedDates(
                location.id,
                daysFromTestNow(1),
                daysFromTestNow(10),
            );
            expect(bookedDates).toContain("2024-06-17");

            // With excluding: Monday is NOT full (moving parcel doesn't add to count)
            const bookedDatesExcluding = await getFullyBookedDates(
                location.id,
                daysFromTestNow(1),
                daysFromTestNow(10),
                parcelToMove.id,
            );
            expect(bookedDatesExcluding).not.toContain("2024-06-17");

            // Slot counts should also exclude the parcel being moved
            const slotCounts = await getTimeslotCounts(location.id, monday10, parcelToMove.id);
            expect(slotCounts["10:00"]).toBe(1); // Only the other parcel
        });
    });
});
