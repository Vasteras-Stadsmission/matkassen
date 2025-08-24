import { describe, test, expect } from "vitest";
import {
    isDateAvailable,
    isTimeAvailable,
    getAvailableTimeRange,
} from "../../../app/utils/schedule/location-availability";
import { LocationScheduleInfo } from "../../../app/[locale]/schedule/types";

// Sample schedule data for testing
const mockLocationSchedules: LocationScheduleInfo = {
    schedules: [
        {
            id: "schedule1",
            name: "Normal Schedule",
            startDate: new Date("2025-05-11"),
            endDate: new Date("2025-05-17"),
            days: [
                { weekday: "monday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "tuesday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "wednesday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
                { weekday: "thursday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "friday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "saturday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "sunday", isOpen: false, openingTime: null, closingTime: null },
            ],
        },
        {
            id: "schedule2",
            name: "Extended Schedule",
            startDate: new Date("2025-05-18"),
            endDate: new Date("2025-06-07"),
            days: [
                { weekday: "monday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "tuesday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
                { weekday: "wednesday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "thursday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
                { weekday: "friday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "saturday", isOpen: false, openingTime: null, closingTime: null },
                { weekday: "sunday", isOpen: false, openingTime: null, closingTime: null },
            ],
        },
    ],
};

describe("Schedule validation utility", () => {
    describe("isDateAvailable", () => {
        test("should return true for a date that has a regular open schedule", () => {
            // Wednesday during first schedule (2025-05-14)
            const date = new Date("2025-05-14");
            const result = isDateAvailable(date, mockLocationSchedules);

            expect(result.isAvailable).toBe(true);
            expect(result.openingTime).toBe("09:00");
            expect(result.closingTime).toBe("17:00");
        });

        test("should return false for a date that has no open schedule", () => {
            // Monday during first schedule (2025-05-12) - not open
            const date = new Date("2025-05-12");
            const result = isDateAvailable(date, mockLocationSchedules);

            expect(result.isAvailable).toBe(false);
        });

        test("should return false for a date outside the range of any schedule", () => {
            // Date before any schedule (2025-05-01)
            const date = new Date("2025-05-01");
            const result = isDateAvailable(date, mockLocationSchedules);

            expect(result.isAvailable).toBe(false);
        });

        test("should return false for a date after the range of all schedules", () => {
            // Date after all schedules (2025-07-01)
            const date = new Date("2025-07-01");
            const result = isDateAvailable(date, mockLocationSchedules);

            expect(result.isAvailable).toBe(false);
        });
    });

    describe("isTimeAvailable", () => {
        test("should return true for a time within opening hours", () => {
            // Wednesday during first schedule (2025-05-14) at 10:00
            const date = new Date("2025-05-14");
            const time = "10:00";
            const result = isTimeAvailable(date, time, mockLocationSchedules);

            expect(result.isAvailable).toBe(true);
        });

        test("should return false for a time before opening hours", () => {
            // Wednesday during first schedule (2025-05-14) at 08:00
            const date = new Date("2025-05-14");
            const time = "08:00";
            const result = isTimeAvailable(date, time, mockLocationSchedules);

            expect(result.isAvailable).toBe(false);
        });

        test("should return false for a time after closing hours", () => {
            // Wednesday during first schedule (2025-05-14) at 18:00
            const date = new Date("2025-05-14");
            const time = "18:00";
            const result = isTimeAvailable(date, time, mockLocationSchedules);

            expect(result.isAvailable).toBe(false);
        });

        test("should return false for any time on a day that is not available", () => {
            // Monday during first schedule (2025-05-12) - closed day
            const date = new Date("2025-05-12");
            const time = "12:00";
            const result = isTimeAvailable(date, time, mockLocationSchedules);

            expect(result.isAvailable).toBe(false);
        });
    });

    describe("getAvailableTimeRange", () => {
        test("should return correct time range for a date with regular schedule", () => {
            // Wednesday during first schedule (2025-05-14)
            const date = new Date("2025-05-14");
            const result = getAvailableTimeRange(date, mockLocationSchedules);

            expect(result.earliestTime).toBe("09:00");
            expect(result.latestTime).toBe("17:00");
        });

        test("should return null values for a date that is not available", () => {
            // Monday during first schedule (2025-05-12) - not open
            const date = new Date("2025-05-12");
            const result = getAvailableTimeRange(date, mockLocationSchedules);

            expect(result.earliestTime).toBeNull();
            expect(result.latestTime).toBeNull();
        });

        test("should return null values for a date outside of any schedule", () => {
            // Date outside any schedule (2025-07-01)
            const date = new Date("2025-07-01");
            const result = getAvailableTimeRange(date, mockLocationSchedules);

            expect(result.earliestTime).toBeNull();
            expect(result.latestTime).toBeNull();
        });
    });
});
