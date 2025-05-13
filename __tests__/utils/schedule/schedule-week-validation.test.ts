import { validateWeekSelection } from "@/app/utils/schedule/schedule-validation";

describe("Schedule Week Selection Validation", () => {
    // Test case 1: User can select the same start week as end week
    it("should allow same start and end week", () => {
        const startWeek = { year: 2023, week: 25 };
        const endWeek = { year: 2023, week: 25 };

        const result = validateWeekSelection(startWeek, endWeek);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    // Test case 2: User can not select start week later than end week
    it("should not allow start week later than end week in the same year", () => {
        const startWeek = { year: 2023, week: 30 };
        const endWeek = { year: 2023, week: 25 };

        const result = validateWeekSelection(startWeek, endWeek);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Start week cannot be after end week");
    });

    // Test case 3: Different years validation
    it("should not allow start week later than end week across different years", () => {
        const startWeek = { year: 2024, week: 5 };
        const endWeek = { year: 2023, week: 52 };

        const result = validateWeekSelection(startWeek, endWeek);

        expect(result.valid).toBe(false);
        expect(result.error).toBe("Start week cannot be after end week");
    });

    // Test case 4: Valid week selection across years
    it("should allow valid week selection across different years", () => {
        const startWeek = { year: 2023, week: 52 };
        const endWeek = { year: 2024, week: 2 };

        const result = validateWeekSelection(startWeek, endWeek);

        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });

    // Test case 5: Should handle null/undefined values
    it("should invalidate selection when start or end week is missing", () => {
        // Missing startWeek
        let result = validateWeekSelection(null, { year: 2023, week: 25 });
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Start and end weeks are required");

        // Missing endWeek
        result = validateWeekSelection({ year: 2023, week: 25 }, null);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Start and end weeks are required");

        // Both missing
        result = validateWeekSelection(null, null);
        expect(result.valid).toBe(false);
        expect(result.error).toBe("Start and end weeks are required");
    });

    // Test case 6: Edge cases with week numbers
    it("should handle edge cases with first and last weeks of the year", () => {
        // Last week of one year to first week of next year
        const result = validateWeekSelection({ year: 2023, week: 1 }, { year: 2023, week: 52 });
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
    });
});
