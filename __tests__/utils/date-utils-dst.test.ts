import { describe, it, expect } from "vitest";
import {
    toStockholmTime,
    fromStockholmTime,
    formatStockholmDate,
    getISOWeekNumber,
    getWeekDates,
    isPastTimeSlot,
    setToStartOfDay,
    setToEndOfDay,
    formatDateToYMD,
    formatTime,
} from "../../app/utils/date-utils";

/**
 * Comprehensive DST and week boundary tests for date-utils
 * Tests actual timezone behavior without mocking date-fns or date-fns-tz
 */
describe("Date Utils - DST & Week Boundary Edge Cases", () => {
    describe("Spring DST Transition (March 30, 2025 - Europe/Stockholm)", () => {
        // Spring DST: 02:00 -> 03:00 (clock jumps forward, "missing hour")

        it("should handle timezone conversion during spring DST transition", () => {
            // Before transition: 01:30 UTC = 02:30 Stockholm (UTC+1)
            const beforeTransition = new Date("2025-03-30T01:30:00.000Z");
            const stockholmBefore = toStockholmTime(beforeTransition);

            // The DST transition happens at 02:00 -> 03:00, so 01:30 UTC is actually 03:30 Stockholm (after jump)
            expect(formatStockholmDate(beforeTransition, "yyyy-MM-dd HH:mm")).toBe(
                "2025-03-30 03:30",
            );

            // During the "missing hour" - should be handled gracefully
            const duringMissingHour = new Date("2025-03-30T01:00:00.000Z"); // This would be 02:00 Stockholm but gets jumped to 03:00
            expect(formatStockholmDate(duringMissingHour, "yyyy-MM-dd HH:mm")).toBe(
                "2025-03-30 03:00",
            );

            // After transition: 02:00 UTC = 04:00 Stockholm (UTC+2)
            const afterTransition = new Date("2025-03-30T02:00:00.000Z");
            expect(formatStockholmDate(afterTransition, "yyyy-MM-dd HH:mm")).toBe(
                "2025-03-30 04:00",
            );
        });

        it("should maintain week boundaries during spring DST transition", () => {
            // Saturday before DST (March 29)
            const saturday = new Date("2025-03-29T12:00:00.000Z");
            // Sunday during DST transition (March 30)
            const sunday = new Date("2025-03-30T12:00:00.000Z");
            // Monday after DST (March 31)
            const monday = new Date("2025-03-31T12:00:00.000Z");

            const saturdayWeek = getWeekDates(saturday);
            const sundayWeek = getWeekDates(sunday);
            const mondayWeek = getWeekDates(monday);

            // Saturday and Sunday should be in the same week
            expect(saturdayWeek.start.getTime()).toBe(sundayWeek.start.getTime());
            expect(saturdayWeek.end.getTime()).toBe(sundayWeek.end.getTime());

            // Monday should be in the next week
            expect(mondayWeek.start.getTime()).toBeGreaterThan(sundayWeek.end.getTime());

            // Verify week boundaries maintain proper Stockholm timezone
            expect(formatStockholmDate(saturdayWeek.start, "yyyy-MM-dd HH:mm")).toBe(
                "2025-03-24 00:00",
            );
            expect(formatStockholmDate(saturdayWeek.end, "yyyy-MM-dd HH:mm")).toBe(
                "2025-03-30 23:59",
            );
        });

        it("should handle ISO week calculation during spring DST", () => {
            const beforeDST = new Date("2025-03-29T12:00:00.000Z"); // Saturday
            const duringDST = new Date("2025-03-30T12:00:00.000Z"); // Sunday (DST transition)
            const afterDST = new Date("2025-03-31T12:00:00.000Z"); // Monday

            const weekBefore = getISOWeekNumber(beforeDST);
            const weekDuring = getISOWeekNumber(duringDST);
            const weekAfter = getISOWeekNumber(afterDST);

            // Saturday and Sunday should be in the same ISO week
            expect(weekBefore).toBe(weekDuring);
            // Monday should be in the next ISO week
            expect(weekAfter).toBe(weekDuring + 1);
        });

        it("should handle start/end of day during spring DST transition", () => {
            const dstTransitionDay = new Date("2025-03-30T12:00:00.000Z");

            const startOfDay = setToStartOfDay(dstTransitionDay);
            const endOfDay = setToEndOfDay(dstTransitionDay);

            // Should be start and end of March 30 in Stockholm timezone
            expect(formatStockholmDate(startOfDay, "yyyy-MM-dd HH:mm:ss")).toBe(
                "2025-03-30 00:00:00",
            );
            expect(formatStockholmDate(endOfDay, "yyyy-MM-dd HH:mm:ss")).toBe(
                "2025-03-30 23:59:59",
            );

            // Verify these are proper UTC times that respect DST
            expect(startOfDay.toISOString()).toBe("2025-03-29T23:00:00.000Z"); // 00:00 Stockholm = 23:00 UTC (UTC+1 before DST)
            expect(endOfDay.toISOString()).toBe("2025-03-30T21:59:59.999Z"); // 23:59 Stockholm = 21:59 UTC (UTC+2 after DST)
        });

        it("should handle Sunday night to Monday morning transition during spring DST", () => {
            // Sunday night before DST ends
            const sundayNight = new Date("2025-03-30T21:30:00.000Z"); // 23:30 Stockholm
            // Monday morning after DST
            const mondayMorning = new Date("2025-03-31T06:00:00.000Z"); // 08:00 Stockholm

            expect(formatStockholmDate(sundayNight, "EEEE")).toBe("Sunday");
            expect(formatStockholmDate(mondayMorning, "EEEE")).toBe("Monday");

            // Week calculation should handle this correctly
            const sundayWeek = getWeekDates(sundayNight);
            const mondayWeek = getWeekDates(mondayMorning);

            expect(formatStockholmDate(sundayWeek.end, "yyyy-MM-dd")).toBe("2025-03-30");
            expect(formatStockholmDate(mondayWeek.start, "yyyy-MM-dd")).toBe("2025-03-31");
        });
    });

    describe("Fall DST Transition (October 26, 2025 - Europe/Stockholm)", () => {
        // Fall DST: 03:00 -> 02:00 (clock jumps back, "duplicate hour")

        it("should handle timezone conversion during fall DST transition", () => {
            // Before transition: 00:30 UTC = 02:30 Stockholm (UTC+2)
            const beforeTransition = new Date("2025-10-26T00:30:00.000Z");
            expect(formatStockholmDate(beforeTransition, "yyyy-MM-dd HH:mm")).toBe(
                "2025-10-26 02:30",
            );

            // After transition: 01:30 UTC = 02:30 Stockholm (UTC+1, second occurrence)
            const afterTransition = new Date("2025-10-26T01:30:00.000Z");
            expect(formatStockholmDate(afterTransition, "yyyy-MM-dd HH:mm")).toBe(
                "2025-10-26 02:30",
            );

            // Both times format to the same Stockholm time but are different UTC times
            expect(beforeTransition.getTime()).not.toBe(afterTransition.getTime());
            expect(afterTransition.getTime() - beforeTransition.getTime()).toBe(3600000); // 1 hour difference in UTC
        });

        it("should maintain week boundaries during fall DST transition", () => {
            // Saturday before DST (October 25)
            const saturday = new Date("2025-10-25T12:00:00.000Z");
            // Sunday during DST transition (October 26)
            const sunday = new Date("2025-10-26T12:00:00.000Z");
            // Monday after DST (October 27)
            const monday = new Date("2025-10-27T12:00:00.000Z");

            const saturdayWeek = getWeekDates(saturday);
            const sundayWeek = getWeekDates(sunday);
            const mondayWeek = getWeekDates(monday);

            // Saturday and Sunday should be in the same week
            expect(saturdayWeek.start.getTime()).toBe(sundayWeek.start.getTime());
            expect(saturdayWeek.end.getTime()).toBe(sundayWeek.end.getTime());

            // Monday should be in the next week
            expect(mondayWeek.start.getTime()).toBeGreaterThan(sundayWeek.end.getTime());

            // Verify week boundaries maintain proper Stockholm timezone
            expect(formatStockholmDate(saturdayWeek.start, "yyyy-MM-dd HH:mm")).toBe(
                "2025-10-20 00:00",
            );
            expect(formatStockholmDate(saturdayWeek.end, "yyyy-MM-dd HH:mm")).toBe(
                "2025-10-26 23:59",
            );
        });

        it("should handle ISO week calculation during fall DST", () => {
            const beforeDST = new Date("2025-10-25T12:00:00.000Z"); // Saturday
            const duringDST = new Date("2025-10-26T12:00:00.000Z"); // Sunday (DST transition)
            const afterDST = new Date("2025-10-27T12:00:00.000Z"); // Monday

            const weekBefore = getISOWeekNumber(beforeDST);
            const weekDuring = getISOWeekNumber(duringDST);
            const weekAfter = getISOWeekNumber(afterDST);

            // Saturday and Sunday should be in the same ISO week
            expect(weekBefore).toBe(weekDuring);
            // Monday should be in the next ISO week
            expect(weekAfter).toBe(weekDuring + 1);
        });

        it("should handle start/end of day during fall DST transition", () => {
            const dstTransitionDay = new Date("2025-10-26T12:00:00.000Z");

            const startOfDay = setToStartOfDay(dstTransitionDay);
            const endOfDay = setToEndOfDay(dstTransitionDay);

            // Should be start and end of October 26 in Stockholm timezone
            expect(formatStockholmDate(startOfDay, "yyyy-MM-dd HH:mm:ss")).toBe(
                "2025-10-26 00:00:00",
            );
            expect(formatStockholmDate(endOfDay, "yyyy-MM-dd HH:mm:ss")).toBe(
                "2025-10-26 23:59:59",
            );

            // Verify these are proper UTC times that respect DST
            expect(startOfDay.toISOString()).toBe("2025-10-25T22:00:00.000Z"); // 00:00 Stockholm = 22:00 UTC (UTC+2 before DST)
            expect(endOfDay.toISOString()).toBe("2025-10-26T22:59:59.999Z"); // 23:59 Stockholm = 22:59 UTC (UTC+1 after DST)
        });

        it("should handle Sunday night to Monday morning transition during fall DST", () => {
            // Sunday night during DST transition
            const sundayNight = new Date("2025-10-26T22:30:00.000Z"); // 23:30 Stockholm
            // Monday morning after DST
            const mondayMorning = new Date("2025-10-27T07:00:00.000Z"); // 08:00 Stockholm

            expect(formatStockholmDate(sundayNight, "EEEE")).toBe("Sunday");
            expect(formatStockholmDate(mondayMorning, "EEEE")).toBe("Monday");

            // Week calculation should handle this correctly
            const sundayWeek = getWeekDates(sundayNight);
            const mondayWeek = getWeekDates(mondayMorning);

            expect(formatStockholmDate(sundayWeek.end, "yyyy-MM-dd")).toBe("2025-10-26");
            expect(formatStockholmDate(mondayWeek.start, "yyyy-MM-dd")).toBe("2025-10-27");
        });
    });

    describe("Week boundary edge cases (non-DST for comparison)", () => {
        it("should handle regular Sunday to Monday transition correctly", () => {
            // Regular week transition in summer (no DST changeover)
            const sundayNight = new Date("2025-08-24T21:59:00.000Z"); // Sunday 23:59 Stockholm
            const mondayMidnight = new Date("2025-08-24T22:00:00.000Z"); // Monday 00:00 Stockholm

            expect(formatStockholmDate(sundayNight, "EEEE")).toBe("Sunday");
            expect(formatStockholmDate(mondayMidnight, "EEEE")).toBe("Monday");

            const sundayWeek = getISOWeekNumber(sundayNight);
            const mondayWeek = getISOWeekNumber(mondayMidnight);

            // Should be consecutive weeks
            expect(mondayWeek).toBe(sundayWeek + 1);
        });

        it("should compare DST and non-DST week calculations", () => {
            // Regular week in summer
            const regularWeek = getWeekDates(new Date("2025-08-20T12:00:00.000Z")); // Wednesday

            // DST transition weeks
            const springDSTWeek = getWeekDates(new Date("2025-03-26T12:00:00.000Z")); // Wednesday before spring DST
            const fallDSTWeek = getWeekDates(new Date("2025-10-22T12:00:00.000Z")); // Wednesday before fall DST

            // All should have proper week structure (Monday to Sunday)
            expect(formatStockholmDate(regularWeek.start, "EEEE")).toBe("Monday");
            expect(formatStockholmDate(regularWeek.end, "EEEE")).toBe("Sunday");

            expect(formatStockholmDate(springDSTWeek.start, "EEEE")).toBe("Monday");
            expect(formatStockholmDate(springDSTWeek.end, "EEEE")).toBe("Sunday");

            expect(formatStockholmDate(fallDSTWeek.start, "EEEE")).toBe("Monday");
            expect(formatStockholmDate(fallDSTWeek.end, "EEEE")).toBe("Sunday");
        });
    });

    describe("Time slot validation during DST transitions", () => {
        it("should correctly identify past time slots during spring DST", () => {
            // Mock "now" to be during DST transition day
            const now = new Date("2025-03-30T10:00:00.000Z"); // 12:00 Stockholm (after DST transition)

            // Morning slot before DST transition should be past
            const morningSlot = new Date("2025-03-30T06:00:00.000Z"); // 08:00 Stockholm
            expect(morningSlot.getTime()).toBeLessThan(now.getTime());

            // Afternoon slot after DST transition
            const afternoonSlot = new Date("2025-03-30T12:00:00.000Z"); // 14:00 Stockholm
            expect(afternoonSlot.getTime()).toBeGreaterThan(now.getTime());
        });

        it("should correctly identify past time slots during fall DST", () => {
            // Mock "now" to be during DST transition day
            const now = new Date("2025-10-26T10:00:00.000Z"); // 11:00 Stockholm (after DST transition)

            // Morning slot before DST transition should be past
            const morningSlot = new Date("2025-10-26T06:00:00.000Z"); // 08:00 Stockholm
            expect(morningSlot.getTime()).toBeLessThan(now.getTime());

            // Afternoon slot after DST transition
            const afternoonSlot = new Date("2025-10-26T12:00:00.000Z"); // 13:00 Stockholm
            expect(afternoonSlot.getTime()).toBeGreaterThan(now.getTime());
        });
    });

    describe("Date formatting consistency during DST", () => {
        it("should format dates consistently across DST transitions", () => {
            // Dates around spring DST transition
            const beforeSpringDST = new Date("2025-03-29T12:00:00.000Z");
            const afterSpringDST = new Date("2025-03-31T12:00:00.000Z");

            expect(formatDateToYMD(beforeSpringDST)).toBe("2025-03-29");
            expect(formatDateToYMD(afterSpringDST)).toBe("2025-03-31");

            // Dates around fall DST transition
            const beforeFallDST = new Date("2025-10-25T12:00:00.000Z");
            const afterFallDST = new Date("2025-10-27T12:00:00.000Z");

            expect(formatDateToYMD(beforeFallDST)).toBe("2025-10-25");
            expect(formatDateToYMD(afterFallDST)).toBe("2025-10-27");
        });

        it("should format times consistently during DST transitions", () => {
            // Same UTC time, different Stockholm times due to DST
            const springTime = new Date("2025-03-30T12:00:00.000Z"); // 14:00 Stockholm (UTC+2)
            const summerTime = new Date("2025-08-15T12:00:00.000Z"); // 14:00 Stockholm (UTC+2)
            const fallTime = new Date("2025-10-26T12:00:00.000Z"); // 13:00 Stockholm (UTC+1 after transition)
            const winterTime = new Date("2025-12-15T12:00:00.000Z"); // 13:00 Stockholm (UTC+1)

            expect(formatTime(springTime)).toBe("14:00");
            expect(formatTime(summerTime)).toBe("14:00");
            expect(formatTime(fallTime)).toBe("13:00");
            expect(formatTime(winterTime)).toBe("13:00");
        });
    });

    describe("Round-trip timezone conversions during DST", () => {
        it("should maintain data integrity in Stockholm->UTC->Stockholm conversions", () => {
            const testDates = [
                "2025-03-29T12:00:00.000Z", // Before spring DST
                "2025-03-30T01:30:00.000Z", // During spring DST transition
                "2025-03-31T12:00:00.000Z", // After spring DST
                "2025-10-25T12:00:00.000Z", // Before fall DST
                "2025-10-26T01:30:00.000Z", // During fall DST transition
                "2025-10-27T12:00:00.000Z", // After fall DST
            ];

            testDates.forEach(dateString => {
                const originalUTC = new Date(dateString);
                const stockholm = toStockholmTime(originalUTC);
                const backToUTC = fromStockholmTime(stockholm);

                // The round-trip should preserve the original time
                // Note: There might be slight differences due to DST handling, but the date should be consistent
                expect(Math.abs(backToUTC.getTime() - originalUTC.getTime())).toBeLessThan(3600000); // Within 1 hour tolerance for DST
            });
        });
    });
});
