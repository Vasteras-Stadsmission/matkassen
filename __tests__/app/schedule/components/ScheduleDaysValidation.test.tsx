import { describe, test, expect, vi } from "bun:test";

// Mock types similar to those used in the component
type Weekday = "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";

type ScheduleDayInput = {
    weekday: Weekday;
    is_open: boolean;
    opening_time: string;
    closing_time: string;
};

type ScheduleInput = {
    name: string;
    start_date: Date | null;
    end_date: Date | null;
    days: ScheduleDayInput[];
};

describe("Schedule Days Validation", () => {
    // Helper to create a schedule with specific days open
    const createSchedule = (daysOpen: Weekday[]): ScheduleInput => {
        const weekdays: Weekday[] = [
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
            "sunday",
        ];

        const days: ScheduleDayInput[] = weekdays.map(weekday => ({
            weekday,
            is_open: daysOpen.includes(weekday),
            opening_time: "09:00",
            closing_time: "17:00",
        }));

        return {
            name: "Test Schedule",
            start_date: new Date(),
            end_date: new Date(),
            days,
        };
    };

    // Function to validate if the schedule has at least one open day
    const validateOpenDays = (schedule: ScheduleInput): boolean => {
        return schedule.days.some(day => day.is_open);
    };

    test("schedule with no open days is invalid", () => {
        const schedule = createSchedule([]);
        expect(validateOpenDays(schedule)).toBe(false);
    });

    test("schedule with one open day is valid", () => {
        const schedule = createSchedule(["monday"]);
        expect(validateOpenDays(schedule)).toBe(true);
    });

    test("schedule with multiple open days is valid", () => {
        const schedule = createSchedule(["monday", "wednesday", "friday"]);
        expect(validateOpenDays(schedule)).toBe(true);
    });

    test("validate form.values.days.some() works correctly with mixed data", () => {
        // This test specifically checks the exact condition used in the button's disabled prop
        const noOpenDays = createSchedule([]);
        expect(noOpenDays.days.some(day => day.is_open)).toBe(false);

        const oneOpenDay = createSchedule(["monday"]);
        expect(oneOpenDay.days.some(day => day.is_open)).toBe(true);
    });

    test("schedule must have a name", () => {
        const validateName = (name: string): boolean => {
            return name.trim().length > 0;
        };

        expect(validateName("")).toBe(false);
        expect(validateName("   ")).toBe(false);
        expect(validateName("Test Schedule")).toBe(true);
    });

    test("schedule with all required fields is valid", () => {
        // Function to validate all required fields
        const validateSchedule = (schedule: ScheduleInput): boolean => {
            return (
                !!schedule.name.trim() &&
                !!schedule.start_date &&
                !!schedule.end_date &&
                schedule.days.some(day => day.is_open)
            );
        };

        const validSchedule = createSchedule(["monday", "friday"]);
        validSchedule.name = "Valid Schedule";

        const invalidNoName = createSchedule(["monday"]);
        invalidNoName.name = "";

        const invalidNoDays = createSchedule([]);
        invalidNoDays.name = "Invalid Schedule";

        const invalidNoStartDate = createSchedule(["monday"]);
        invalidNoStartDate.name = "Valid Name";
        invalidNoStartDate.start_date = null;

        expect(validateSchedule(validSchedule)).toBe(true);
        expect(validateSchedule(invalidNoName)).toBe(false);
        expect(validateSchedule(invalidNoDays)).toBe(false);
        expect(validateSchedule(invalidNoStartDate)).toBe(false);
    });
});
