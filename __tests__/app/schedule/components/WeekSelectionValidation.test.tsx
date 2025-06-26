import { describe, vi, test, expect, beforeEach, afterEach } from "vitest";
import { getWeekDateRange } from "../../../../app/utils/schedule/schedule-validation";
import { mockDate, cleanupMockedDate } from "../test-helpers";

// Mock the validation function with a simplified version
vi.mock("../../../../app/utils/schedule/schedule-validation", () => ({
    getWeekDateRange: (year: number, week: number) => {
        // Calculate approximate dates for the week
        const startDate = new Date(year, 0, 1 + (week - 1) * 7);
        const endDate = new Date(year, 0, 7 + (week - 1) * 7);
        return { startDate, endDate };
    },
}));

// Week selection types matching what's used in the ScheduleForm
type WeekSelection = {
    year: number;
    week: number;
};

describe("Schedule Week Selection Validation", () => {
    // Store original Date for cleanup
    let RealDate: DateConstructor;

    beforeEach(() => {
        // Set up consistent date for tests
        RealDate = global.Date;
        global.Date = mockDate("2025-04-15");

        // Reset state before each test
        startWeek = null;
        endWeek = null;
        startDate = null;
        endDate = null;
        isValidSelection = false;
    });

    afterEach(() => {
        // Clean up mocked date
        cleanupMockedDate(RealDate);
    });

    // Mock implementation of the ScheduleForm's week handling logic
    let startWeek: WeekSelection | null;
    let endWeek: WeekSelection | null;
    let startDate: Date | null;
    let endDate: Date | null;
    let isValidSelection: boolean;

    // Helper to simulate the form's week selection logic
    const updateWeeks = () => {
        if (startWeek) {
            const { startDate: start } = getWeekDateRange(startWeek.year, startWeek.week);
            startDate = start;
        } else {
            startDate = null;
        }

        if (endWeek) {
            const { endDate: end } = getWeekDateRange(endWeek.year, endWeek.week);
            endDate = end;
        } else {
            endDate = null;
        }

        // Recalculate form validation
        isValidSelection = validateWeekSelection();
    };

    // Simplified validation logic similar to what's in the ScheduleForm
    const validateWeekSelection = (): boolean => {
        if (!startDate || !endDate) return false;

        // Same week is valid
        if (
            startWeek &&
            endWeek &&
            startWeek.year === endWeek.year &&
            startWeek.week === endWeek.week
        ) {
            return true;
        }

        // Normal date validation
        return endDate >= startDate;
    };

    // Helper to set start week and update dates
    const setStartWeek = (value: WeekSelection | null) => {
        startWeek = value;

        // Handle case where end week is now invalid
        if (
            startWeek &&
            endWeek &&
            (startWeek.year > endWeek.year ||
                (startWeek.year === endWeek.year && startWeek.week > endWeek.week))
        ) {
            // In the real component, this would set the end week equal to start week
            endWeek = { ...startWeek };
        }

        updateWeeks();
    };

    // Helper to set end week and update dates
    const setEndWeek = (value: WeekSelection | null) => {
        // Check if we're trying to set end week earlier than start week
        if (
            value &&
            startWeek &&
            (value.year < startWeek.year ||
                (value.year === startWeek.year && value.week < startWeek.week))
        ) {
            // In the component, this would prevent setting invalid end week
            endWeek = { ...startWeek };
        } else {
            endWeek = value;
        }

        updateWeeks();
    };

    test("can select same week for start and end", () => {
        const week = { year: 2025, week: 18 };

        setStartWeek(week);
        setEndWeek(week);

        expect(startWeek).toEqual(endWeek);
        expect(isValidSelection).toBe(true);
    });

    test("cannot select end week earlier than start week", () => {
        // First set start week
        setStartWeek({ year: 2025, week: 20 });

        // Try to set end week to an earlier week
        setEndWeek({ year: 2025, week: 18 });

        // End week should be auto-adjusted to match start week
        expect(endWeek).toEqual(startWeek);
        expect(isValidSelection).toBe(true);
    });

    test("cannot select start week later than end week", () => {
        // Set end week first
        setEndWeek({ year: 2025, week: 20 });

        // Then set start week to a later week
        setStartWeek({ year: 2025, week: 22 });

        // End week should be auto-adjusted to match the new start week
        expect(endWeek).toEqual(startWeek);
        expect(isValidSelection).toBe(true);
    });

    test("can select valid week ranges across different years", () => {
        // Set start week to last week of 2024
        setStartWeek({ year: 2024, week: 52 });

        // Set end week to first week of 2025
        setEndWeek({ year: 2025, week: 1 });

        expect(isValidSelection).toBe(true);
    });

    test("form is invalid if start week is not selected", () => {
        // Only set end week
        setEndWeek({ year: 2025, week: 20 });

        expect(isValidSelection).toBe(false);
    });

    test("form is invalid if end week is not selected", () => {
        // Only set start week
        setStartWeek({ year: 2025, week: 20 });

        expect(isValidSelection).toBe(false);
    });
});
