import {
    doDateRangesOverlap,
    findOverlappingSchedule,
} from "@/app/utils/schedule/schedule-validation";
import { ScheduleDateRange } from "@/app/[locale]/handout-locations/types";

describe("Schedule validation edge cases", () => {
    describe("doDateRangesOverlap - timezone and boundary edge cases", () => {
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

    describe("findOverlappingSchedule - edge cases", () => {
        it("should handle multiple potential overlaps and return the first one", () => {
            const newRange: ScheduleDateRange = {
                start_date: new Date("2025-05-10"),
                end_date: new Date("2025-05-20"),
            };

            const existingRanges: ScheduleDateRange[] = [
                {
                    id: "schedule-1",
                    start_date: new Date("2025-05-05"),
                    end_date: new Date("2025-05-15"), // Overlaps with newRange
                },
                {
                    id: "schedule-2",
                    start_date: new Date("2025-05-12"),
                    end_date: new Date("2025-05-25"), // Also overlaps with newRange
                },
                {
                    id: "schedule-3",
                    start_date: new Date("2025-06-01"),
                    end_date: new Date("2025-06-30"), // No overlap
                },
            ];

            const overlapping = findOverlappingSchedule(newRange, existingRanges);
            expect(overlapping).not.toBeNull();
            expect(overlapping?.id).toBe("schedule-1"); // Should return the first overlapping one
        });

        it("should handle boundary conditions with consecutive schedules", () => {
            const newRange: ScheduleDateRange = {
                start_date: new Date("2025-05-16"),
                end_date: new Date("2025-05-31"),
            };

            const existingRanges: ScheduleDateRange[] = [
                {
                    id: "schedule-before",
                    start_date: new Date("2025-05-01"),
                    end_date: new Date("2025-05-15"), // Ends day before newRange starts
                },
                {
                    id: "schedule-after",
                    start_date: new Date("2025-06-01"),
                    end_date: new Date("2025-06-15"), // Starts day after newRange ends
                },
            ];

            const overlapping = findOverlappingSchedule(newRange, existingRanges);
            expect(overlapping).toBeNull(); // No overlap with consecutive schedules
        });
    });
});
