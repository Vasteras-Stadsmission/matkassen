import { describe, it, expect } from "vitest";
import { startOfWeek } from "date-fns";
import { getISOWeekYear } from "date-fns";
import {
    getISOWeekNumber,
    getWeekDateRange,
} from "../../../app/utils/schedule/schedule-validation";

describe("WeekPicker ISO week-year behavior", () => {
    it("maps the week containing 2025-12-31 to ISO year 2026, week 1", () => {
        const date = new Date("2025-12-31T00:00:00Z");

        // Simulate WeekPicker's use of the week's Monday for selection
        const monday = startOfWeek(date, { weekStartsOn: 1 }); // Monday

        // Week number should be 1
        expect(getISOWeekNumber(monday)).toBe(1);
        // ISO week-year should be 2026
        expect(getISOWeekYear(monday)).toBe(2026);

        // And the corresponding range for { year: 2026, week: 1 } should be Dec 29, 2025 - Jan 4, 2026
        const { startDate, endDate } = getWeekDateRange(2026, 1);
        expect(startDate.toISOString().slice(0, 10)).toBe("2025-12-29");
        expect(endDate.toISOString().slice(0, 10)).toBe("2026-01-04");
    });

    it("does not incorrectly map {year: 2025, week: 1} to the late-December 2025 week", () => {
        const { startDate, endDate } = getWeekDateRange(2025, 1);
        // Week 1 of 2025 should start on 2024-12-30 and end on 2025-01-05
        expect(startDate.toISOString().slice(0, 10)).toBe("2024-12-30");
        expect(endDate.toISOString().slice(0, 10)).toBe("2025-01-05");
    });

    it("returns ISO week number 1 for 2025-12-31 (safety check)", () => {
        const date = new Date("2025-12-31T00:00:00Z");
        expect(getISOWeekNumber(date)).toBe(1);
    });
});
