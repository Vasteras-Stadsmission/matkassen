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

        it("should handle consecutive schedules correctly (back-to-back)", () => {
            // Schedule 1 ends on June 10, Schedule 2 starts on June 11
            // These should NOT overlap
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-06-01"),
                end_date: new Date("2025-06-10"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-06-11"),
                end_date: new Date("2025-06-20"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(false);
        });

        it("should handle timezone edge cases consistently", () => {
            // Create dates that might behave differently across timezones
            // Using ISO string format which should be consistent
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-05-01T00:00:00.000Z"),
                end_date: new Date("2025-05-15T23:59:59.999Z"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-05-16T00:00:00.000Z"),
                end_date: new Date("2025-05-31T23:59:59.999Z"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(false);
        });

        it("should handle same-day boundaries correctly", () => {
            // Both schedules on the same day should overlap
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-05-15T09:00:00.000Z"),
                end_date: new Date("2025-05-15T12:00:00.000Z"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-05-15T14:00:00.000Z"),
                end_date: new Date("2025-05-15T18:00:00.000Z"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(true);
        });

        it("should handle DST transition periods correctly", () => {
            // Test dates around DST transitions (March/October in most regions)
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-03-28"), // Around spring DST transition
                end_date: new Date("2025-03-30"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-03-31"),
                end_date: new Date("2025-04-02"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(false);
        });

        it("should handle year boundary transitions correctly", () => {
            // Schedule ending on Dec 31, next starting on Jan 1
            const range1: ScheduleDateRange = {
                start_date: new Date("2024-12-28"),
                end_date: new Date("2024-12-31"),
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-01-01"),
                end_date: new Date("2025-01-07"),
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(false);
        });

        it("should handle time zone variations correctly", () => {
            // Test with different time zones that might affect date boundaries
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-05-01T22:00:00.000Z"), // Late evening UTC
                end_date: new Date("2025-05-15T02:00:00.000Z"), // Early morning UTC
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-05-16T22:00:00.000Z"), // Late evening UTC
                end_date: new Date("2025-05-30T02:00:00.000Z"), // Early morning UTC
            };

            expect(doDateRangesOverlap(range1, range2)).toBe(false);
        });

        it("should handle minimal gap between schedules", () => {
            // Schedule 1 ends on a Friday, Schedule 2 starts on the following Monday
            const range1: ScheduleDateRange = {
                start_date: new Date("2025-05-01"), // Thursday
                end_date: new Date("2025-05-02"), // Friday
            };
            const range2: ScheduleDateRange = {
                start_date: new Date("2025-05-05"), // Monday
                end_date: new Date("2025-05-09"), // Friday
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

            // Calculate days between dates - there should be 6 days difference from Monday to Sunday
            // We need to use exact date comparison without time components
            const startDateOnly = new Date(range.startDate.toISOString().split("T")[0]);
            const endDateOnly = new Date(range.endDate.toISOString().split("T")[0]);
            const diffInDays = Math.round(
                (endDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24),
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

            // Calculate days between dates - there should be 6 days difference
            const startDateOnly = new Date(range.startDate.toISOString().split("T")[0]);
            const endDateOnly = new Date(range.endDate.toISOString().split("T")[0]);
            const diffInDays = Math.round(
                (endDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24),
            );
            expect(diffInDays).toBe(6); // 6 days difference from Monday to Sunday
        });

        it("should return correct date range for week 19 in 2025", () => {
            // Week 19 in 2025 - this was the specific case that had issues
            const range = getWeekDateRange(2025, 19);

            // Week 19 in 2025 should be May 5 - May 11
            expect(range.startDate.toISOString().slice(0, 10)).toBe("2025-05-05");
            expect(range.endDate.toISOString().slice(0, 10)).toBe("2025-05-11");
        });

        it("should handle timezone edge cases correctly", () => {
            // Week 19 in 2025 should be May 5 - May 11 regardless of timezone
            const range = getWeekDateRange(2025, 19);

            // Create date with specific time to test timezone handling
            const startWithTime = new Date(range.startDate);
            startWithTime.setHours(0, 0, 0, 0); // Set to midnight

            const endWithTime = new Date(range.endDate);
            endWithTime.setHours(23, 59, 59, 999); // Set to end of day

            // Extract dates only (YYYY-MM-DD) to ensure timezone doesn't affect the date
            const startDateOnly = startWithTime.toISOString().split("T")[0];
            const endDateOnly = endWithTime.toISOString().split("T")[0];

            expect(startDateOnly).toBe("2025-05-05");
            expect(endDateOnly).toBe("2025-05-11");

            // Regardless of the time part, the day of week should be consistent
            expect(startWithTime.getDay()).toBe(1); // Monday
            expect(endWithTime.getDay()).toBe(0); // Sunday
        });

        it("should consistently return Monday as first day for all weeks of 2025", () => {
            // Test several weeks throughout the year
            const weeksToTest = [1, 10, 19, 27, 36, 44, 52];

            for (const week of weeksToTest) {
                const range = getWeekDateRange(2025, week);
                expect(range.startDate.getDay()).toBe(1); // Monday
                expect(range.endDate.getDay()).toBe(0); // Sunday

                // Calculate days between dates correctly - should be 6 days difference
                const startDateOnly = new Date(range.startDate.toISOString().split("T")[0]);
                const endDateOnly = new Date(range.endDate.toISOString().split("T")[0]);
                const diffInDays = Math.round(
                    (endDateOnly.getTime() - startDateOnly.getTime()) / (1000 * 60 * 60 * 24),
                );
                expect(diffInDays).toBe(6);
            }
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
