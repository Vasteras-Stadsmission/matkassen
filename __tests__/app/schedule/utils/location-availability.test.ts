import { describe, it, expect } from "vitest";
import {
    isDateAvailable,
    isTimeAvailable,
    getAvailableTimeRange,
} from "../../../../app/utils/schedule/location-availability";

describe("Location Availability Utilities", () => {
    // Define test schedule data that matches our specific test cases
    const mockScheduleInfo = {
        schedules: [
            {
                id: "schedule-1",
                location_id: "location-1",
                name: "Regular Schedule",
                startDate: new Date("2025-05-01"),
                endDate: new Date("2025-05-31"),
                // Days array with weekday configurations
                days: [
                    { weekday: "monday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
                    {
                        weekday: "tuesday",
                        isOpen: true,
                        openingTime: "09:00",
                        closingTime: "17:00",
                    },
                    {
                        weekday: "wednesday",
                        isOpen: true,
                        openingTime: "06:45",
                        closingTime: "10:15",
                    },
                    {
                        weekday: "thursday",
                        isOpen: true,
                        openingTime: "09:00",
                        closingTime: "17:00",
                    },
                    { weekday: "friday", isOpen: true, openingTime: "09:00", closingTime: "17:00" },
                    {
                        weekday: "saturday",
                        isOpen: true,
                        openingTime: "19:45",
                        closingTime: "22:30",
                    },
                    { weekday: "sunday", isOpen: false, openingTime: null, closingTime: null },
                ],
            },
        ],
    };

    describe("isDateAvailable", () => {
        it("returns true for days when the location is open", () => {
            // Check Monday (open day)
            const mondayDate = new Date("2025-05-05"); // First Monday in May 2025
            const mondayResult = isDateAvailable(mondayDate, mockScheduleInfo);
            expect(mondayResult.isAvailable).toBe(true);

            // Check Wednesday with special hours (still open)
            const wednesdayDate = new Date("2025-05-07"); // First Wednesday in May 2025
            const wednesdayResult = isDateAvailable(wednesdayDate, mockScheduleInfo);
            expect(wednesdayResult.isAvailable).toBe(true);
        });

        it("returns false for days when the location is closed", () => {
            // Check Sunday (closed day)
            const sundayDate = new Date("2025-05-04"); // First Sunday in May 2025
            const sundayResult = isDateAvailable(sundayDate, mockScheduleInfo);
            expect(sundayResult.isAvailable).toBe(false);
            expect(sundayResult.reason).toBeTruthy(); // Should have a reason
        });

        it("returns false for dates outside the schedule period", () => {
            // Date before the schedule starts
            const beforeDate = new Date("2025-04-30");
            const beforeResult = isDateAvailable(beforeDate, mockScheduleInfo);
            expect(beforeResult.isAvailable).toBe(false);

            // Date after the schedule ends
            const afterDate = new Date("2025-06-01");
            const afterResult = isDateAvailable(afterDate, mockScheduleInfo);
            expect(afterResult.isAvailable).toBe(false);
        });
    });

    describe("getAvailableTimeRange", () => {
        it("returns the correct opening and closing times for normal days", () => {
            // Monday (standard 9-17)
            const mondayDate = new Date("2025-05-05");
            const mondayRange = getAvailableTimeRange(mondayDate, mockScheduleInfo);
            expect(mondayRange.earliestTime).toBe("09:00");
            expect(mondayRange.latestTime).toBe("17:00");
        });

        it("returns the correct times for Wednesday with special hours", () => {
            // Wednesday (special 06:45-10:15)
            const wednesdayDate = new Date("2025-05-07");
            const wednesdayRange = getAvailableTimeRange(wednesdayDate, mockScheduleInfo);
            expect(wednesdayRange.earliestTime).toBe("06:45");
            expect(wednesdayRange.latestTime).toBe("10:15");
        });

        it("returns the correct times for Saturday with late hours", () => {
            // Saturday (special 19:45-22:30)
            const saturdayDate = new Date("2025-05-10");
            const saturdayRange = getAvailableTimeRange(saturdayDate, mockScheduleInfo);
            expect(saturdayRange.earliestTime).toBe("19:45");
            expect(saturdayRange.latestTime).toBe("22:30");
        });

        it("returns null values for closed days", () => {
            // Sunday (closed)
            const sundayDate = new Date("2025-05-11");
            const sundayRange = getAvailableTimeRange(sundayDate, mockScheduleInfo);
            expect(sundayRange.earliestTime).toBeNull();
            expect(sundayRange.latestTime).toBeNull();
        });
    });

    describe("isTimeAvailable", () => {
        it("returns true for times within opening hours", () => {
            // Monday at 10:00 (within 9:00-17:00)
            const mondayDate = new Date("2025-05-05");
            const mondayResult = isTimeAvailable(mondayDate, "10:00", mockScheduleInfo);
            expect(mondayResult.isAvailable).toBe(true);

            // Wednesday at 07:30 (within 06:45-10:15)
            const wednesdayDate = new Date("2025-05-07");
            const wednesdayResult = isTimeAvailable(wednesdayDate, "07:30", mockScheduleInfo);
            expect(wednesdayResult.isAvailable).toBe(true);

            // Saturday at 20:00 (within 19:45-22:30)
            const saturdayDate = new Date("2025-05-10");
            const saturdayResult = isTimeAvailable(saturdayDate, "20:00", mockScheduleInfo);
            expect(saturdayResult.isAvailable).toBe(true);
        });

        it("returns false for times outside opening hours", () => {
            // Monday at 08:00 (before 9:00)
            const mondayDate = new Date("2025-05-05");
            const mondayEarlyResult = isTimeAvailable(mondayDate, "08:00", mockScheduleInfo);
            expect(mondayEarlyResult.isAvailable).toBe(false);
            expect(mondayEarlyResult.reason).toBeTruthy();

            // Monday at 18:00 (after 17:00)
            const mondayLateResult = isTimeAvailable(mondayDate, "18:00", mockScheduleInfo);
            expect(mondayLateResult.isAvailable).toBe(false);
            expect(mondayLateResult.reason).toBeTruthy();

            // Wednesday at 11:00 (after 10:15)
            const wednesdayDate = new Date("2025-05-07");
            const wednesdayLateResult = isTimeAvailable(wednesdayDate, "11:00", mockScheduleInfo);
            expect(wednesdayLateResult.isAvailable).toBe(false);
            expect(wednesdayLateResult.reason).toBeTruthy();

            // Saturday at 18:00 (before 19:45)
            const saturdayDate = new Date("2025-05-10");
            const saturdayEarlyResult = isTimeAvailable(saturdayDate, "18:00", mockScheduleInfo);
            expect(saturdayEarlyResult.isAvailable).toBe(false);
            expect(saturdayEarlyResult.reason).toBeTruthy();
        });

        it("returns false for times on closed days", () => {
            // Sunday at 12:00 (closed day)
            const sundayDate = new Date("2025-05-11");
            const sundayResult = isTimeAvailable(sundayDate, "12:00", mockScheduleInfo);
            expect(sundayResult.isAvailable).toBe(false);
            expect(sundayResult.reason).toBeTruthy();
        });

        it("returns true for times that end exactly at closing time", () => {
            // Monday at 17:00 (exactly at closing time)
            const mondayDate = new Date("2025-05-05");
            const mondayClosingResult = isTimeAvailable(mondayDate, "17:00", mockScheduleInfo);
            expect(mondayClosingResult.isAvailable).toBe(true);

            // Wednesday at 10:15 (exactly at closing time)
            const wednesdayDate = new Date("2025-05-07");
            const wednesdayClosingResult = isTimeAvailable(
                wednesdayDate,
                "10:15",
                mockScheduleInfo,
            );
            expect(wednesdayClosingResult.isAvailable).toBe(true);

            // Saturday at 22:30 (exactly at closing time)
            const saturdayDate = new Date("2025-05-10");
            const saturdayClosingResult = isTimeAvailable(saturdayDate, "22:30", mockScheduleInfo);
            expect(saturdayClosingResult.isAvailable).toBe(true);
        });
    });
});
