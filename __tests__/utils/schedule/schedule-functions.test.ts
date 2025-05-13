import { describe, it, expect } from "bun:test";
import {
    getISOWeekNumber,
    getWeekDateRange,
    findOverlappingSchedule,
    getWeekAndYear,
    getWeekNumbersInRange,
} from "@/app/utils/schedule/schedule-validation";
import { ScheduleDateRange } from "@/app/[locale]/handout-locations/types";

describe("Schedule Validation Functions", () => {
    describe("getISOWeekNumber", () => {
        it("returns the correct ISO week number for specific dates", () => {
            // Test case 1: January 1, 2023 (Sunday) is in week 52 of 2022 in ISO
            expect(getISOWeekNumber(new Date(2023, 0, 1))).toBe(52);

            // Test case 2: January 2, 2023 (Monday) is in week 1 of 2023 in ISO
            expect(getISOWeekNumber(new Date(2023, 0, 2))).toBe(1);

            // Test case 3: December 31, 2023 (Sunday) is in week 52 of 2023 in ISO
            expect(getISOWeekNumber(new Date(2023, 11, 31))).toBe(52);

            // Test case 4: Middle of the year - July 15, 2023 (Saturday) is in week 28
            expect(getISOWeekNumber(new Date(2023, 6, 15))).toBe(28);
        });
    });

    describe("getWeekAndYear", () => {
        it("returns the correct week and year combination", () => {
            // Test case 1: First week of 2023
            const date1 = new Date(2023, 0, 4); // January 4, 2023
            expect(getWeekAndYear(date1)).toEqual({ week: 1, year: 2023 });

            // Test case 2: Last week of 2022 that extends into 2023
            const date2 = new Date(2023, 0, 1); // January 1, 2023
            expect(getWeekAndYear(date2)).toEqual({ week: 52, year: 2023 });

            // Test case 3: Middle of the year
            const date3 = new Date(2023, 6, 15); // July 15, 2023
            expect(getWeekAndYear(date3)).toEqual({ week: 28, year: 2023 });
        });
    });

    describe("getWeekDateRange", () => {
        it("returns the correct date range for a specific week", () => {
            // Test case 1: Week 1 of 2023
            const { startDate: start1, endDate: end1 } = getWeekDateRange(2023, 1);
            expect(start1.getFullYear()).toBe(2023);
            expect(start1.getMonth()).toBe(0); // January
            expect(start1.getDate()).toBe(2); // January 2, 2023 - Monday
            expect(end1.getFullYear()).toBe(2023);
            expect(end1.getMonth()).toBe(0); // January
            expect(end1.getDate()).toBe(8); // January 8, 2023 - Sunday

            // Test case 2: Week 52 of 2023
            const { startDate: start2, endDate: end2 } = getWeekDateRange(2023, 52);
            expect(start2.getFullYear()).toBe(2023);
            expect(start2.getMonth()).toBe(11); // December
            expect(start2.getDate()).toBe(25); // December 25, 2023 - Monday
            expect(end2.getFullYear()).toBe(2023);
            expect(end2.getMonth()).toBe(11); // December
            expect(end2.getDate()).toBe(31); // December 31, 2023 - Sunday
        });
    });

    describe("getWeekNumbersInRange", () => {
        it("returns all week numbers in a date range", () => {
            // Test case 1: Range spanning 3 weeks
            const startDate1 = new Date(2023, 0, 9); // January 9, 2023 - Week 2
            const endDate1 = new Date(2023, 0, 29); // January 29, 2023 - Week 4
            expect(getWeekNumbersInRange(startDate1, endDate1)).toEqual([2, 3, 4]);

            // Test case 2: Range spanning one week
            const startDate2 = new Date(2023, 0, 9); // January 9, 2023 - Week 2
            const endDate2 = new Date(2023, 0, 15); // January 15, 2023 - Still Week 2
            expect(getWeekNumbersInRange(startDate2, endDate2)).toEqual([2]);

            // Test case 3: Range spanning the new year
            const startDate3 = new Date(2022, 11, 26); // December 26, 2022 - Week 52
            const endDate3 = new Date(2023, 0, 8); // January 8, 2023 - Week 1
            expect(getWeekNumbersInRange(startDate3, endDate3)).toEqual([52, 1]);
        });
    });

    describe("findOverlappingSchedule", () => {
        it("correctly identifies overlapping schedules", () => {
            const schedules: ScheduleDateRange[] = [
                {
                    id: "1",
                    start_date: new Date(2023, 0, 1),
                    end_date: new Date(2023, 0, 15),
                },
                {
                    id: "2",
                    start_date: new Date(2023, 0, 20),
                    end_date: new Date(2023, 0, 31),
                },
                {
                    id: "3",
                    start_date: new Date(2023, 1, 10),
                    end_date: new Date(2023, 1, 20),
                },
            ];

            // Test case 1: No overlap
            const newSchedule1: ScheduleDateRange = {
                id: "4",
                start_date: new Date(2023, 0, 16),
                end_date: new Date(2023, 0, 19),
            };
            expect(findOverlappingSchedule(newSchedule1, schedules)).toBeNull();

            // Test case 2: Overlap with schedule 1
            const newSchedule2: ScheduleDateRange = {
                id: "4",
                start_date: new Date(2023, 0, 10),
                end_date: new Date(2023, 0, 20),
            };
            expect(findOverlappingSchedule(newSchedule2, schedules)).toEqual(schedules[0]);

            // Test case 3: Should not find itself as an overlap when editing
            const editSchedule: ScheduleDateRange = {
                id: "1", // Same ID as an existing schedule
                start_date: new Date(2023, 0, 1),
                end_date: new Date(2023, 0, 15),
            };
            expect(findOverlappingSchedule(editSchedule, schedules)).toBeNull();
        });
    });
});
