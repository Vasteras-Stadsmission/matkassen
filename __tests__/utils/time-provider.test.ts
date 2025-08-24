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
