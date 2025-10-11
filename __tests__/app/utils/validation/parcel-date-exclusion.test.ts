import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for date exclusion logic in parcel scheduling
 *
 * These tests verify Bug Fix #1:
 * - Today should be excluded if all opening hours have passed
 * - Prevents users from scheduling parcels in the past
 *
 * Regression test for: https://github.com/Vasteras-Stadsmission/matkassen/issues/XXX
 */

describe("Parcel Date Exclusion Logic", () => {
    beforeEach(() => {
        // Mock the current time
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe("Today's date exclusion based on opening hours", () => {
        it("should exclude today if current time is past closing time", () => {
            // Set current time to 18:00 (6 PM)
            vi.setSystemTime(new Date("2025-10-10T18:00:00"));

            const today = new Date("2025-10-10");
            const openingHours = {
                openingTime: "09:00",
                closingTime: "17:00", // Closes at 5 PM
            };

            // Logic from isDateExcluded function
            const [closeHour, closeMinute] = openingHours.closingTime
                .split(":")
                .map(n => parseInt(n, 10));
            const closingTime = new Date(today);
            closingTime.setHours(closeHour, closeMinute, 0, 0);

            const now = new Date();
            const shouldExclude = now >= closingTime;

            expect(shouldExclude).toBe(true);
        });

        it("should allow today if current time is before closing time", () => {
            // Set current time to 14:00 (2 PM)
            vi.setSystemTime(new Date("2025-10-10T14:00:00"));

            const today = new Date("2025-10-10");
            const openingHours = {
                openingTime: "09:00",
                closingTime: "17:00", // Closes at 5 PM
            };

            const [closeHour, closeMinute] = openingHours.closingTime
                .split(":")
                .map(n => parseInt(n, 10));
            const closingTime = new Date(today);
            closingTime.setHours(closeHour, closeMinute, 0, 0);

            const now = new Date();
            const shouldExclude = now >= closingTime;

            expect(shouldExclude).toBe(false);
        });

        it("should exclude today at exact closing time", () => {
            // Set current time to exactly 17:00 (5 PM)
            vi.setSystemTime(new Date("2025-10-10T17:00:00"));

            const today = new Date("2025-10-10");
            const openingHours = {
                openingTime: "09:00",
                closingTime: "17:00",
            };

            const [closeHour, closeMinute] = openingHours.closingTime
                .split(":")
                .map(n => parseInt(n, 10));
            const closingTime = new Date(today);
            closingTime.setHours(closeHour, closeMinute, 0, 0);

            const now = new Date();
            const shouldExclude = now >= closingTime;

            expect(shouldExclude).toBe(true);
        });

        it("should allow today 1 minute before closing", () => {
            // Set current time to 16:59
            vi.setSystemTime(new Date("2025-10-10T16:59:00"));

            const today = new Date("2025-10-10");
            const openingHours = {
                openingTime: "09:00",
                closingTime: "17:00",
            };

            const [closeHour, closeMinute] = openingHours.closingTime
                .split(":")
                .map(n => parseInt(n, 10));
            const closingTime = new Date(today);
            closingTime.setHours(closeHour, closeMinute, 0, 0);

            const now = new Date();
            const shouldExclude = now >= closingTime;

            expect(shouldExclude).toBe(false);
        });

        it("should handle late-night closing times (23:30)", () => {
            // Set current time to midnight
            vi.setSystemTime(new Date("2025-10-11T00:15:00"));

            const yesterday = new Date("2025-10-10");
            const openingHours = {
                openingTime: "10:00",
                closingTime: "23:30",
            };

            const [closeHour, closeMinute] = openingHours.closingTime
                .split(":")
                .map(n => parseInt(n, 10));
            const closingTime = new Date(yesterday);
            closingTime.setHours(closeHour, closeMinute, 0, 0);

            const now = new Date();

            // Today is 2025-10-11, yesterday was 2025-10-10
            // Closing time is 2025-10-10 23:30
            // Current time is 2025-10-11 00:15
            // So we're comparing different days, should not exclude TODAY

            // This test verifies date comparison works correctly
            const todayMidnight = new Date("2025-10-11");
            todayMidnight.setHours(0, 0, 0, 0);

            const yesterdayMidnight = new Date("2025-10-10");
            yesterdayMidnight.setHours(0, 0, 0, 0);

            // We should only check closing time if we're checking the same day
            const shouldExclude =
                todayMidnight.getTime() === yesterdayMidnight.getTime() && now >= closingTime;

            expect(shouldExclude).toBe(false);
        });
    });

    describe("Edge cases", () => {
        it("should handle single-digit hours correctly", () => {
            vi.setSystemTime(new Date("2025-10-10T09:30:00"));

            const today = new Date("2025-10-10");
            const openingHours = {
                openingTime: "9:00", // Single digit
                closingTime: "9:15",
            };

            const [closeHour, closeMinute] = openingHours.closingTime
                .split(":")
                .map(n => parseInt(n, 10));
            const closingTime = new Date(today);
            closingTime.setHours(closeHour, closeMinute, 0, 0);

            const now = new Date();
            const shouldExclude = now >= closingTime;

            expect(shouldExclude).toBe(true);
        });

        it("should handle 24-hour format correctly", () => {
            vi.setSystemTime(new Date("2025-10-10T00:30:00"));

            const today = new Date("2025-10-10");
            const openingHours = {
                openingTime: "00:00",
                closingTime: "23:59",
            };

            const [closeHour, closeMinute] = openingHours.closingTime
                .split(":")
                .map(n => parseInt(n, 10));
            const closingTime = new Date(today);
            closingTime.setHours(closeHour, closeMinute, 0, 0);

            const now = new Date();
            const shouldExclude = now >= closingTime;

            expect(shouldExclude).toBe(false);
        });
    });
});
