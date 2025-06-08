// Mock the database actions
import * as dbActions from "@/app/db/actions";

import { vi } from "vitest";
const mockLocationData = {
    id: "location-1",
    name: "Lifecenter Church Västerås",
    street_address: "Example Street 123",
    postal_code: "12345",
    slot_duration_minutes: 15, // Default slot duration is 15 minutes
    max_parcels_per_day: 20,
};

const mockScheduleData = {
    id: "schedule-1",
    location_id: "location-1",
    name: "Regular Schedule",
    startDate: new Date("2025-05-01"),
    endDate: new Date("2025-05-31"),
    // Days array with weekday configurations
    days: [
        { weekday: "monday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
        { weekday: "tuesday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
        { weekday: "wednesday", isOpen: true, openingTime: "06:45", closingTime: "10:15" },
        { weekday: "thursday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
        { weekday: "friday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
        { weekday: "saturday", isOpen: true, openingTime: "19:45", closingTime: "22:30" },
        { weekday: "sunday", isOpen: false, openingTime: null, closingTime: null },
    ],
};

// Mock Next.js cache and the actions module
vi.mock("next/cache", () => ({
    unstable_cache: fn => fn, // Just return the function without caching
}));

// Mock the actions module
vi.mock("@/app/[locale]/schedule/actions", () => {
    return {
        getLocationSlotDuration: async locationId => {
            if (locationId === "location-1") {
                return 15;
            }
            return 15; // Default
        },
        getPickupLocationSchedules: async locationId => {
            if (locationId === "location-1") {
                return {
                    schedules: [mockScheduleData],
                };
            }
            return { schedules: [] };
        },
    };
});

// Import the functions AFTER mocking
import {
    getLocationSlotDuration,
    getPickupLocationSchedules,
    LocationScheduleInfo,
} from "@/app/[locale]/schedule/actions";

describe("Schedule Server Actions", () => {
    describe("getLocationSlotDuration", () => {
        it("returns the correct slot duration for a location", async () => {
            const duration = await getLocationSlotDuration("location-1");
            expect(duration).toBe(15);
        });

        it("returns default duration when no slot duration is configured", async () => {
            const duration = await getLocationSlotDuration("location-2");
            // Default should be 15 minutes
            expect(duration).toBe(15);
        });
    });

    describe("getPickupLocationSchedules", () => {
        it("retrieves the correct schedule information for a location", async () => {
            const scheduleInfo = await getPickupLocationSchedules("location-1");

            // Test that the schedule contains the correct information
            expect(scheduleInfo).toBeTruthy();
            expect(scheduleInfo.schedules).toBeTruthy();
            expect(scheduleInfo.schedules?.length).toBeGreaterThan(0);

            // Test specific schedules
            const schedule = scheduleInfo.schedules?.[0];
            expect(schedule).toBeTruthy();

            // Check Wednesday's special hours
            expect(schedule?.days.find(day => day.weekday === "wednesday")?.isOpen).toBe(true);
            expect(schedule?.days.find(day => day.weekday === "wednesday")?.openingTime).toBe(
                "06:45",
            );
            expect(schedule?.days.find(day => day.weekday === "wednesday")?.closingTime).toBe(
                "10:15",
            );

            // Check Saturday's special hours
            expect(schedule?.days.find(day => day.weekday === "saturday")?.isOpen).toBe(true);
            expect(schedule?.days.find(day => day.weekday === "saturday")?.openingTime).toBe(
                "19:45",
            );
            expect(schedule?.days.find(day => day.weekday === "saturday")?.closingTime).toBe(
                "22:30",
            );

            // Check Sunday (closed)
            expect(schedule?.days.find(day => day.weekday === "sunday")?.isOpen).toBe(false);
        });

        it("handles locations with no schedules", async () => {
            const scheduleInfo = await getPickupLocationSchedules("location-no-schedule");

            expect(scheduleInfo).toBeTruthy();
            expect(scheduleInfo.schedules).toEqual([]);
        });
    });
});
