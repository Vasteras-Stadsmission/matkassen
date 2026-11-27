import { describe, expect, it } from "vitest";
import {
    getRescheduleTimeSlots,
    selectedRescheduleTime,
} from "@/app/utils/schedule/reschedule-time-slots";
import type { LocationScheduleInfo } from "@/app/[locale]/schedule/types";

const closed = { isOpen: false, openingTime: null, closingTime: null };

// Open Wednesdays 09:10–10:00, closed every other day
const schedules: LocationScheduleInfo = {
    schedules: [
        {
            id: "s1",
            name: "Wednesdays",
            startDate: new Date("2025-05-01"),
            endDate: new Date("2025-06-30"),
            days: [
                { weekday: "monday", ...closed },
                { weekday: "tuesday", ...closed },
                { weekday: "wednesday", isOpen: true, openingTime: "09:10", closingTime: "10:00" },
                { weekday: "thursday", ...closed },
                { weekday: "friday", ...closed },
                { weekday: "saturday", ...closed },
                { weekday: "sunday", ...closed },
            ],
        },
    ],
};

const wednesday = new Date("2025-05-14T10:00:00Z");
const thursday = new Date("2025-05-15T10:00:00Z");

describe("getRescheduleTimeSlots", () => {
    it("offers nothing until a date is picked and the schedules have loaded", () => {
        const empty = { slots: [], firstAvailable: null, errorKey: null };
        expect(getRescheduleTimeSlots(null, schedules, 15, true)).toEqual(empty);
        expect(getRescheduleTimeSlots(wednesday, null, 15, true)).toEqual(empty);
    });

    it("explains a closed day", () => {
        expect(getRescheduleTimeSlots(thursday, schedules, 15, true)).toEqual({
            slots: [],
            firstAvailable: null,
            errorKey: "dateUnavailable",
        });
    });

    it("rounds the first slot up to the slot grid", () => {
        const result = getRescheduleTimeSlots(wednesday, schedules, 15, true);
        expect(result.slots.map(slot => slot.value)).toEqual(["09:15", "09:30", "09:45"]);
        expect(result.firstAvailable).toBe("09:15");
        expect(result.errorKey).toBeNull();
    });

    it("starts at opening time without the slot grid", () => {
        const result = getRescheduleTimeSlots(wednesday, schedules, 15, false);
        expect(result.slots.map(slot => slot.value)).toEqual(["09:10", "09:25", "09:40"]);
        expect(result.firstAvailable).toBe("09:10");
    });

    it("says no times are available when no slot fits before closing", () => {
        const result = getRescheduleTimeSlots(wednesday, schedules, 60, true);
        expect(result.slots).toEqual([]);
        expect(result.errorKey).toBe("noTimesAvailable");
    });
});

describe("selectedRescheduleTime", () => {
    const quarterHours = getRescheduleTimeSlots(wednesday, schedules, 15, true);

    it("takes the first available time until the user picks one", () => {
        expect(selectedRescheduleTime(quarterHours, undefined)).toBe("09:15");
    });

    it("keeps the user's pick while it is offered", () => {
        expect(selectedRescheduleTime(quarterHours, "09:45")).toBe("09:45");
    });

    it("stays empty once the user clears the pick", () => {
        expect(selectedRescheduleTime(quarterHours, null)).toBeNull();
    });

    it("drops a pick the slots no longer offer", () => {
        // 09:45 was picked with 15-minute slots; the location uses 20-minute ones
        const twentyMinutes = getRescheduleTimeSlots(wednesday, schedules, 20, true);
        expect(twentyMinutes.slots.map(slot => slot.value)).not.toContain("09:45");
        expect(selectedRescheduleTime(twentyMinutes, "09:45")).toBe(twentyMinutes.firstAvailable);
    });
});
