import { describe, test, expect } from "bun:test";

// Mock types and utils similar to those in the application
type WeekSelection = {
    year: number;
    week: number;
};

// Type for date range
type DateRange = {
    start_date: Date | null;
    end_date: Date | null;
};

describe("Schedule Date Range Validation", () => {
    // Helper function to check if end date is valid with respect to start date
    const isEndDateValid = (startDate: Date | null, endDate: Date | null): boolean => {
        if (!startDate || !endDate) return false;
        return endDate >= startDate;
    };

    // Helper function to validate week selection
    const isWeekSelectionValid = (
        startWeek: WeekSelection | null,
        endWeek: WeekSelection | null,
    ): boolean => {
        if (!startWeek || !endWeek) return false;

        // Same year, check week
        if (startWeek.year === endWeek.year) {
            return endWeek.week >= startWeek.week;
        }

        // Different year, check year
        return endWeek.year > startWeek.year;
    };

    test("same start and end week is valid", () => {
        const startWeek: WeekSelection = { year: 2025, week: 20 };
        const endWeek: WeekSelection = { year: 2025, week: 20 };

        expect(isWeekSelectionValid(startWeek, endWeek)).toBe(true);
    });

    test("start week later than end week is invalid", () => {
        const startWeek: WeekSelection = { year: 2025, week: 21 };
        const endWeek: WeekSelection = { year: 2025, week: 20 };

        expect(isWeekSelectionValid(startWeek, endWeek)).toBe(false);
    });

    test("end week earlier than start week is invalid", () => {
        const startWeek: WeekSelection = { year: 2025, week: 20 };
        const endWeek: WeekSelection = { year: 2025, week: 19 };

        expect(isWeekSelectionValid(startWeek, endWeek)).toBe(false);
    });

    test("different years are handled correctly", () => {
        // Valid: End year is later than start year
        const startWeek1: WeekSelection = { year: 2025, week: 52 };
        const endWeek1: WeekSelection = { year: 2026, week: 1 };
        expect(isWeekSelectionValid(startWeek1, endWeek1)).toBe(true);

        // Invalid: End year is earlier than start year
        const startWeek2: WeekSelection = { year: 2026, week: 1 };
        const endWeek2: WeekSelection = { year: 2025, week: 52 };
        expect(isWeekSelectionValid(startWeek2, endWeek2)).toBe(false);
    });

    test("date validation with null values", () => {
        const validRange: DateRange = {
            start_date: new Date(2025, 4, 1),
            end_date: new Date(2025, 4, 7),
        };

        const nullStartDate: DateRange = {
            start_date: null,
            end_date: new Date(2025, 4, 7),
        };

        const nullEndDate: DateRange = {
            start_date: new Date(2025, 4, 1),
            end_date: null,
        };

        const bothNull: DateRange = {
            start_date: null,
            end_date: null,
        };

        expect(isEndDateValid(validRange.start_date, validRange.end_date)).toBe(true);
        expect(isEndDateValid(nullStartDate.start_date, nullStartDate.end_date)).toBe(false);
        expect(isEndDateValid(nullEndDate.start_date, nullEndDate.end_date)).toBe(false);
        expect(isEndDateValid(bothNull.start_date, bothNull.end_date)).toBe(false);
    });

    test("same date for start and end is valid", () => {
        const sameDay: DateRange = {
            start_date: new Date(2025, 4, 1),
            end_date: new Date(2025, 4, 1),
        };

        expect(isEndDateValid(sameDay.start_date, sameDay.end_date)).toBe(true);
    });
});
