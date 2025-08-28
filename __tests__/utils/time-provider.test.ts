import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
    TimeProvider,
    MockTimeProvider,
    StockholmTime,
    Time,
    setTimeProvider,
    getTimeProvider,
} from "../../app/utils/time-provider";

describe("TimeProvider", () => {
    let originalProvider: any;

    beforeEach(() => {
        originalProvider = getTimeProvider();
    });

    afterEach(() => {
        setTimeProvider(originalProvider);
    });

    describe("StockholmTime", () => {
        it("should create Stockholm time from Date", () => {
            const utcDate = new Date("2025-08-23T22:00:00.000Z"); // Saturday 22:00 UTC
            const stockholmTime = new StockholmTime(utcDate);

            // In summer, Stockholm is UTC+2, so this should be Sunday 00:00
            expect(stockholmTime.format("yyyy-MM-dd HH:mm")).toBe("2025-08-24 00:00");
            expect(stockholmTime.getWeekdayName()).toBe("sunday");
        });

        it("should handle weekday mapping correctly", () => {
            // Test each day of the week
            const testDates = [
                { date: "2025-08-24T12:00:00.000Z", expected: "sunday" }, // Sunday
                { date: "2025-08-25T12:00:00.000Z", expected: "monday" }, // Monday
                { date: "2025-08-26T12:00:00.000Z", expected: "tuesday" }, // Tuesday
                { date: "2025-08-27T12:00:00.000Z", expected: "wednesday" }, // Wednesday
                { date: "2025-08-28T12:00:00.000Z", expected: "thursday" }, // Thursday
                { date: "2025-08-29T12:00:00.000Z", expected: "friday" }, // Friday
                { date: "2025-08-30T12:00:00.000Z", expected: "saturday" }, // Saturday
            ];

            testDates.forEach(({ date, expected }) => {
                const stockholmTime = new StockholmTime(date);
                expect(stockholmTime.getWeekdayName()).toBe(expected);
            });
        });

        it("should handle start and end of day correctly", () => {
            const stockholmTime = new StockholmTime("2025-08-23T15:30:45.123Z");

            const startOfDay = stockholmTime.startOfDay();
            expect(startOfDay.format("HH:mm:ss.SSS")).toBe("00:00:00.000");

            const endOfDay = stockholmTime.endOfDay();
            expect(endOfDay.format("HH:mm:ss.SSS")).toBe("23:59:59.999");
        });

        it("should handle start and end of week correctly (Monday start)", () => {
            // Start with a Wednesday
            const wednesday = new StockholmTime("2025-08-27T15:30:00.000Z");

            const startOfWeek = wednesday.startOfWeek();
            expect(startOfWeek.getWeekdayName()).toBe("monday");
            expect(startOfWeek.format("HH:mm:ss")).toBe("00:00:00");

            const endOfWeek = wednesday.endOfWeek();
            expect(endOfWeek.getWeekdayName()).toBe("sunday");
            expect(endOfWeek.format("HH:mm:ss.SSS")).toBe("23:59:59.999");
        });

        it("should compare times correctly", () => {
            const time1 = new StockholmTime("2025-08-23T10:00:00.000Z");
            const time2 = new StockholmTime("2025-08-23T12:00:00.000Z");
            const time3 = new StockholmTime("2025-08-23T14:00:00.000Z");

            expect(time1.isBefore(time2)).toBe(true);
            expect(time2.isAfter(time1)).toBe(true);
            expect(time2.isBetween(time1, time3)).toBe(true);
            expect(time1.isBetween(time2, time3)).toBe(false);
        });
    });

    describe("TimeProvider (production implementation)", () => {
        it("should return current Stockholm time", () => {
            const provider = new TimeProvider();
            const now = provider.now();

            expect(now).toBeInstanceOf(StockholmTime);

            // Should be very close to current time (within 1 second)
            const actualNow = new Date();
            const timeDiff = Math.abs(now.getTime() - actualNow.getTime());
            expect(timeDiff).toBeLessThan(1000);
        });

        it("should convert Date to StockholmTime", () => {
            const provider = new TimeProvider();
            const testDate = new Date("2025-08-23T12:00:00.000Z");
            const stockholmTime = provider.fromDate(testDate);

            expect(stockholmTime).toBeInstanceOf(StockholmTime);
            expect(stockholmTime.format("yyyy-MM-dd HH:mm")).toBe("2025-08-23 14:00"); // UTC+2 in summer
        });

        it("should parse date strings", () => {
            const provider = new TimeProvider();
            const stockholmTime = provider.fromString("2025-08-23T12:00:00.000Z");

            expect(stockholmTime).toBeInstanceOf(StockholmTime);
            expect(stockholmTime.toDateString()).toBe("2025-08-23");
        });

        it("should parse time strings with base date", () => {
            const provider = new TimeProvider();
            const baseDate = provider.fromString("2025-08-23T00:00:00.000Z");
            const parsedTime = provider.parseTime("14:30", baseDate);

            expect(parsedTime.toTimeString()).toBe("14:30");
            expect(parsedTime.toDateString()).toBe("2025-08-23");
        });
    });

    describe("MockTimeProvider", () => {
        it("should allow setting mock time for testing", () => {
            const mockProvider = new MockTimeProvider("2025-08-23T23:30:00.000Z");
            setTimeProvider(mockProvider);

            const now = Time.now();
            expect(now.format("yyyy-MM-dd HH:mm")).toBe("2025-08-24 01:30"); // UTC+2
            expect(now.getWeekdayName()).toBe("sunday");
        });

        it("should handle Saturday night to Sunday transition", () => {
            // Simulate the original bug scenario
            const mockProvider = new MockTimeProvider("2025-08-23T22:00:00.000Z"); // Saturday night UTC
            setTimeProvider(mockProvider);

            const now = Time.now();
            expect(now.getWeekdayName()).toBe("sunday"); // Should be Sunday in Stockholm

            // Create a Sunday parcel
            const sundayParcel = Time.fromString("2025-08-24T10:00:00.000Z");
            expect(sundayParcel.getWeekdayName()).toBe("sunday");

            // The parcel should be "after" the current time in Stockholm
            expect(sundayParcel.isAfter(now)).toBe(true);
        });
    });

    describe("Provider switching for testing", () => {
        it("should switch between real and mock providers", () => {
            // Start with real provider
            const realProvider = new TimeProvider();
            setTimeProvider(realProvider);

            const realNow = Time.now();

            // Switch to mock provider
            const mockProvider = new MockTimeProvider("2025-01-01T12:00:00.000Z");
            setTimeProvider(mockProvider);

            const mockNow = Time.now();

            // Should be different times
            expect(mockNow.toDateString()).toBe("2025-01-01");
            expect(realNow.toDateString()).not.toBe("2025-01-01");

            // Verify the mock is being used
            expect(mockNow.format("yyyy-MM-dd HH:mm")).toBe("2025-01-01 13:00"); // UTC+1 in winter
        });

        it("should demonstrate timezone bug fix scenario", () => {
            // Simulate the original bug: Saturday night UTC, but Sunday in Stockholm
            const mockProvider = new MockTimeProvider("2025-08-23T22:30:00.000Z");
            setTimeProvider(mockProvider);

            const now = Time.now();
            const sundayParcel = Time.fromString("2025-08-24T10:00:00.000Z");

            // With the old approach, this comparison might fail due to timezone issues
            // With TimeProvider, it works correctly
            expect(now.getWeekdayName()).toBe("sunday"); // 22:30 UTC = 00:30 Stockholm (Sunday)
            expect(sundayParcel.getWeekdayName()).toBe("sunday");
            expect(sundayParcel.isAfter(now)).toBe(true); // Parcel is later on Sunday

            // This would be the kind of check that failed in the original bug
            const isFutureParcel = sundayParcel.isAfter(now);
            expect(isFutureParcel).toBe(true);
        });
    });

    describe("Time convenience functions", () => {
        it("should provide easy access to time operations", () => {
            const mockProvider = new MockTimeProvider("2025-08-23T10:00:00.000Z");
            setTimeProvider(mockProvider);

            const now = Time.now();
            const fromDate = Time.fromDate(new Date("2025-08-24T12:00:00.000Z"));
            const fromString = Time.fromString("2025-08-25T14:00:00.000Z");

            expect(now.toDateString()).toBe("2025-08-23");
            expect(fromDate.toDateString()).toBe("2025-08-24");
            expect(fromString.toDateString()).toBe("2025-08-25");
        });

        it("should parse time strings correctly", () => {
            const mockProvider = new MockTimeProvider("2025-08-23T00:00:00.000Z");
            setTimeProvider(mockProvider);

            const baseDate = Time.now();
            const parsedTime = Time.parseTime("14:30", baseDate);

            expect(parsedTime.toTimeString()).toBe("14:30");
            expect(parsedTime.toDateString()).toBe(baseDate.toDateString());
        });
    });

    describe("DST transition edge cases", () => {
        describe("Spring DST transition (March 30, 2025)", () => {
            it("should handle week boundaries during spring DST transition", () => {
                // Spring DST: March 30, 2025 at 02:00 -> 03:00 (Sunday)
                const saturdayBeforeDST = new StockholmTime("2025-03-29T22:00:00.000Z"); // Saturday 23:00 Stockholm
                const sundayDuringDST = new StockholmTime("2025-03-30T12:00:00.000Z"); // Sunday 14:00 Stockholm (after transition)
                const mondayAfterDST = new StockholmTime("2025-03-31T06:00:00.000Z"); // Monday 08:00 Stockholm

                // Verify weekday detection across DST transition
                expect(saturdayBeforeDST.getWeekdayName()).toBe("saturday");
                expect(sundayDuringDST.getWeekdayName()).toBe("sunday");
                expect(mondayAfterDST.getWeekdayName()).toBe("monday");

                // Test week boundaries
                const weekStart = saturdayBeforeDST.startOfWeek();
                const weekEnd = saturdayBeforeDST.endOfWeek();

                expect(weekStart.getWeekdayName()).toBe("monday");
                expect(weekEnd.getWeekdayName()).toBe("sunday");

                // Verify the week end encompasses the DST transition
                expect(weekEnd.isAfter(sundayDuringDST)).toBe(true);
            });

            it("should handle Sunday night to Monday morning transition during spring DST", () => {
                // Sunday 22:00 before DST transition ends
                const sundayNight = new StockholmTime("2025-03-30T20:59:00.000Z"); // 22:59 Stockholm
                const mondayMorning = new StockholmTime("2025-03-31T06:00:00.000Z"); // 08:00 Stockholm

                expect(sundayNight.getWeekdayName()).toBe("sunday");
                expect(mondayMorning.getWeekdayName()).toBe("monday");

                // Monday should be after Sunday
                expect(mondayMorning.isAfter(sundayNight)).toBe(true);

                // Week calculation should be consistent
                const sundayWeekEnd = sundayNight.endOfWeek();
                const mondayWeekStart = mondayMorning.startOfWeek();

                expect(sundayWeekEnd.getWeekdayName()).toBe("sunday");
                expect(mondayWeekStart.getWeekdayName()).toBe("monday");
            });

            it("should handle time comparisons across spring DST boundary", () => {
                // Before DST transition (01:30 UTC = 02:30 Stockholm)
                const beforeTransition = new StockholmTime("2025-03-30T01:30:00.000Z");
                // After DST transition (01:30 UTC = 03:30 Stockholm, due to clock jump)
                const afterTransition = new StockholmTime("2025-03-30T01:30:00.000Z");

                // Both should be Sunday but at different Stockholm times
                expect(beforeTransition.getWeekdayName()).toBe("sunday");
                expect(afterTransition.getWeekdayName()).toBe("sunday");

                // Times during the "missing hour" should be handled gracefully
                const duringMissingHour = new StockholmTime("2025-03-30T01:00:00.000Z"); // 02:00 Stockholm (gets jumped to 03:00)
                expect(duringMissingHour.getWeekdayName()).toBe("sunday");
            });

            it("should maintain ISO week consistency during spring DST", () => {
                const beforeDST = new StockholmTime("2025-03-29T12:00:00.000Z"); // Saturday, week 13
                const afterDST = new StockholmTime("2025-03-31T12:00:00.000Z"); // Monday, week 14

                // Saturday (week 13) and Monday (week 14) should be in consecutive weeks
                expect(beforeDST.getISOWeek()).toBe(13);
                expect(afterDST.getISOWeek()).toBe(14);
                expect(afterDST.getISOWeek()).toBe(beforeDST.getISOWeek() + 1);
            });
        });

        describe("Fall DST transition (October 26, 2025)", () => {
            it("should handle week boundaries during fall DST transition", () => {
                // Fall DST: October 26, 2025 at 03:00 -> 02:00 (Sunday)
                const saturdayBeforeDST = new StockholmTime("2025-10-25T12:00:00.000Z"); // Saturday 14:00 Stockholm
                const sundayDuringDST = new StockholmTime("2025-10-26T12:00:00.000Z"); // Sunday 13:00 Stockholm (after transition)
                const mondayAfterDST = new StockholmTime("2025-10-27T07:00:00.000Z"); // Monday 08:00 Stockholm

                // Verify weekday detection across DST transition
                expect(saturdayBeforeDST.getWeekdayName()).toBe("saturday");
                expect(sundayDuringDST.getWeekdayName()).toBe("sunday");
                expect(mondayAfterDST.getWeekdayName()).toBe("monday");

                // Test week boundaries
                const weekStart = saturdayBeforeDST.startOfWeek();
                const weekEnd = saturdayBeforeDST.endOfWeek();

                expect(weekStart.getWeekdayName()).toBe("monday");
                expect(weekEnd.getWeekdayName()).toBe("sunday");

                // Verify the week end encompasses the DST transition
                expect(weekEnd.isAfter(sundayDuringDST)).toBe(true);
            });

            it("should handle Sunday night to Monday morning transition during fall DST", () => {
                // Sunday 22:00 during DST transition
                const sundayNight = new StockholmTime("2025-10-26T21:59:00.000Z"); // 22:59 Stockholm
                const mondayMorning = new StockholmTime("2025-10-27T07:00:00.000Z"); // 08:00 Stockholm

                expect(sundayNight.getWeekdayName()).toBe("sunday");
                expect(mondayMorning.getWeekdayName()).toBe("monday");

                // Monday should be after Sunday
                expect(mondayMorning.isAfter(sundayNight)).toBe(true);

                // Week calculation should be consistent
                const sundayWeekEnd = sundayNight.endOfWeek();
                const mondayWeekStart = mondayMorning.startOfWeek();

                expect(sundayWeekEnd.getWeekdayName()).toBe("sunday");
                expect(mondayWeekStart.getWeekdayName()).toBe("monday");
            });

            it("should handle duplicate hour during fall DST transition", () => {
                // During fall DST, 02:00-03:00 occurs twice
                // First occurrence (before transition, UTC+2)
                const firstOccurrence = new StockholmTime("2025-10-26T00:30:00.000Z"); // 02:30 Stockholm (first time)
                // Second occurrence (after transition, UTC+1)
                const secondOccurrence = new StockholmTime("2025-10-26T01:30:00.000Z"); // 02:30 Stockholm (second time)

                expect(firstOccurrence.getWeekdayName()).toBe("sunday");
                expect(secondOccurrence.getWeekdayName()).toBe("sunday");

                // The second occurrence should be after the first in UTC
                expect(secondOccurrence.isAfter(firstOccurrence)).toBe(true);

                // Both should format to the same Stockholm time but be different UTC times
                expect(firstOccurrence.format("HH:mm")).toBe("02:30");
                expect(secondOccurrence.format("HH:mm")).toBe("02:30");
                expect(firstOccurrence.getTime()).not.toBe(secondOccurrence.getTime());
            });

            it("should maintain ISO week consistency during fall DST", () => {
                const beforeDST = new StockholmTime("2025-10-25T12:00:00.000Z"); // Saturday, week 43
                const afterDST = new StockholmTime("2025-10-27T12:00:00.000Z"); // Monday, week 44

                // Saturday (week 43) and Monday (week 44) should be in consecutive weeks
                expect(beforeDST.getISOWeek()).toBe(43);
                expect(afterDST.getISOWeek()).toBe(44);
                expect(afterDST.getISOWeek()).toBe(beforeDST.getISOWeek() + 1);
            });
        });

        describe("Week boundary edge cases", () => {
            it("should handle Sunday 23:59 to Monday 00:00 transition correctly", () => {
                // Test regular week (no DST)
                const sundayNight = new StockholmTime("2025-08-24T21:59:00.000Z"); // Sunday 23:59 Stockholm
                const mondayMidnight = new StockholmTime("2025-08-24T22:00:00.000Z"); // Monday 00:00 Stockholm

                expect(sundayNight.getWeekdayName()).toBe("sunday");
                expect(mondayMidnight.getWeekdayName()).toBe("monday");

                // Should be in consecutive weeks
                expect(sundayNight.getISOWeek()).toBe(34);
                expect(mondayMidnight.getISOWeek()).toBe(35);

                // Monday should be after Sunday
                expect(mondayMidnight.isAfter(sundayNight)).toBe(true);
            });

            it("should handle week transitions during DST changeover weekends", () => {
                // Spring DST weekend: Week transitions with time jump
                const springWeekTransition = new StockholmTime("2025-03-30T20:00:00.000Z"); // Sunday 22:00 Stockholm
                const springNextWeekStart = new StockholmTime("2025-03-31T06:00:00.000Z"); // Monday 08:00 Stockholm

                expect(springWeekTransition.getWeekdayName()).toBe("sunday");
                expect(springNextWeekStart.getWeekdayName()).toBe("monday");

                // Fall DST weekend: Week transitions with time duplication
                const fallWeekTransition = new StockholmTime("2025-10-26T21:00:00.000Z"); // Sunday 22:00 Stockholm
                const fallNextWeekStart = new StockholmTime("2025-10-27T07:00:00.000Z"); // Monday 08:00 Stockholm

                expect(fallWeekTransition.getWeekdayName()).toBe("sunday");
                expect(fallNextWeekStart.getWeekdayName()).toBe("monday");

                // Both transitions should work consistently
                expect(springNextWeekStart.isAfter(springWeekTransition)).toBe(true);
                expect(fallNextWeekStart.isAfter(fallWeekTransition)).toBe(true);
            });
        });
    });

    describe("Database integration patterns", () => {
        it("should provide UTC dates for database storage", () => {
            const stockholmTime = new StockholmTime("2025-08-23T12:00:00.000Z");
            const utcForDb = stockholmTime.toUTC();

            // Should be a regular Date object suitable for database
            expect(utcForDb instanceof Date).toBe(true);
            // The UTC conversion should preserve the time since we started with UTC
            expect(utcForDb.toISOString()).toBe("2025-08-23T12:00:00.000Z");
        });

        it("should format dates for SQL queries", () => {
            const stockholmTime = new StockholmTime("2025-08-23T15:30:00.000Z");

            expect(stockholmTime.toDateString()).toBe("2025-08-23");
            expect(stockholmTime.toTimeString()).toBe("17:30"); // Stockholm time
            expect(stockholmTime.format("yyyy-MM-dd HH:mm:ss")).toBe("2025-08-23 17:30:00");
        });
    });
});
