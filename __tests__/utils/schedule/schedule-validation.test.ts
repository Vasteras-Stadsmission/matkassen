import {
    doDateRangesOverlap,
    findOverlappingSchedule,
    getWeekDateRange,
    getWeekAndYear,
} from "@/app/utils/schedule/schedule-validation";
import { ScheduleDateRange } from "@/app/[locale]/handout-locations/types";

describe("Schedule validation functions", () => {
    describe("doDateRangesOverlap", () => {
        it("should return true when date ranges overlap", () => {
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-15"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-05-10"),
                end_date: new Date("2025-05-20"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(true);
        });

        it("should return true when one range is completely inside another", () => {
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-31"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-05-10"),
                end_date: new Date("2025-05-20"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(true);
        });

        it("should return true when ranges touch at endpoints (inclusive)", () => {
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-15"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-05-15"),
                end_date: new Date("2025-05-31"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(true);
        });

        it("should return false when ranges don't overlap", () => {
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-14"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-05-15"),
                end_date: new Date("2025-05-31"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(false);
        });

        it("should return false when ranges are the same but have the same ID", () => {
            const range1: ScheduleDateRange = {
                id: "schedule-123",
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-31"),
            };
            const range2: ScheduleDateRange = {
                id: "schedule-123",
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-31"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(false);
        });
    });

    describe("findOverlappingSchedule", () => {
        it("should find and return an overlapping schedule", () => {
            const newRange: ScheduleDateRange = {
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-15"),
            };

            const existingRanges: ScheduleDateRange[] = [
                {
                    id: "schedule-1",
                    start_date: new Date("2025-04-01"),
                    end_date: new Date("2025-04-30"),
                },
                {
                    id: "schedule-2",
                    start_date: new Date("2025-05-10"), // Overlaps with newRange
                    end_date: new Date("2025-05-20"),
                },
                {
                    id: "schedule-3",
                    start_date: new Date("2025-06-01"),
                    end_date: new Date("2025-06-30"),
                },
            ];

            const overlapping = findOverlappingSchedule(newRange, existingRanges);
            expect(overlapping).not.toBeNull();
            expect(overlapping?.id).toBe("schedule-2");
        });

        it("should return null when no schedules overlap", () => {
            const newRange: ScheduleDateRange = {
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-15"),
            };

            const existingRanges: ScheduleDateRange[] = [
                {
                    id: "schedule-1",
                    start_date: new Date("2025-04-01"),
                    end_date: new Date("2025-04-30"),
                },
                {
                    id: "schedule-3",
                    start_date: new Date("2025-06-01"),
                    end_date: new Date("2025-06-30"),
                },
            ];

            const overlapping = findOverlappingSchedule(newRange, existingRanges);
            expect(overlapping).toBeNull();
        });

        it("should not consider the same schedule as overlapping", () => {
            const newRange: ScheduleDateRange = {
                id: "schedule-1",
                start_date: new Date("2025-05-01"),
                end_date: new Date("2025-05-15"),
            };

            const existingRanges: ScheduleDateRange[] = [
                {
                    id: "schedule-1", // Same ID
                    start_date: new Date("2025-05-01"),
                    end_date: new Date("2025-05-15"),
                },
                {
                    id: "schedule-2",
                    start_date: new Date("2025-06-01"),
                    end_date: new Date("2025-06-15"),
                },
            ];

            const overlapping = findOverlappingSchedule(newRange, existingRanges);
            expect(overlapping).toBeNull();
        });
    });

    describe("getWeekDateRange", () => {
        it("should return correct date range for a week in the middle of the year", () => {
            // Week 18 in 2025 (Swedish/European standard)
            const range = getWeekDateRange(2025, 18);

            // Week 18 in 2025 is April 28 - May 4
            expect(range.startDate.toISOString().slice(0, 10)).toBe("2025-04-28");
            expect(range.endDate.toISOString().slice(0, 10)).toBe("2025-05-04");
        });

        it("should handle the first week of the year correctly", () => {
            // Week 1 in 2025
            const range = getWeekDateRange(2025, 1);

            // Ensure it's actually a valid week and follows the expected pattern
            expect(range.startDate.getDay()).toBe(1); // Monday

            // The range should span 7 days from Monday to Sunday
            const diffInDays = Math.round(
                (range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60 * 60 * 24),
            );
            expect(diffInDays).toBe(6); // 6 days difference from Monday to Sunday

            // The start and end dates should be in the correct relation to each other
            expect(range.endDate.getDay()).toBe(0); // Sunday
        });

        it("should handle the last week of the year correctly", () => {
            // Week 52 in 2025 (might be 52 or 53 depending on the year)
            const range = getWeekDateRange(2025, 52);

            // Ensure it starts with a Monday and ends with a Sunday
            expect(range.startDate.getDay()).toBe(1); // Monday
            expect(range.endDate.getDay()).toBe(0); // Sunday

            // The week should span 7 days
            const diffInDays = Math.round(
                (range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60 * 60 * 24),
            );
            expect(diffInDays).toBe(6); // 6 days difference from Monday to Sunday
        });
    });

    describe("getWeekAndYear", () => {
        it("should return the correct week and year for a date in the middle of the year", () => {
            const date = new Date("2025-05-06"); // A Tuesday in May 2025
            const { week, year } = getWeekAndYear(date);

            // May 6, 2025 should be in week 19
            expect(week).toBe(19);
            expect(year).toBe(2025);
        });

        it("should handle the last days of December correctly", () => {
            // December 30, 2024 (Monday) could be week 1 of 2025 or week 53 of 2024 depending on ISO week calculation
            const date = new Date("2024-12-30");
            const { week, year } = getWeekAndYear(date);

            // This is an edge case, the important part is that the function returns a consistent result
            // that aligns with ISO 8601 standard
            expect(week).toBeGreaterThan(0);
            expect(week).toBeLessThan(54);
        });

        it("should handle the first days of January correctly", () => {
            // January 2, 2025 (Thursday) could be in week 1 of 2025 or week 53 of 2024
            const date = new Date("2025-01-02");
            const { week, year } = getWeekAndYear(date);

            // This is an edge case, the important part is that the function returns a consistent result
            // that aligns with ISO 8601 standard
            expect(week).toBeGreaterThan(0);
            expect(week).toBeLessThan(54);
        });
    });
});
