import { describe, expect, it } from "vitest";
import {
    getRescheduleTimeSlots,
    selectedRescheduleTime,
} from "@/app/utils/schedule/reschedule-time-slots";
import type { LocationScheduleInfo } from "@/app/[locale]/schedule/types";

const closed = { isOpen: false, openingTime: null, closingTime: null };

// Open Wednesdays only, during the given hours
function openWednesdays(openingTime: string, closingTime: string): LocationScheduleInfo {
    return {
        schedules: [
            {
                id: "s1",
                name: "Wednesdays",
                startDate: new Date("2025-05-01"),
                endDate: new Date("2025-06-30"),
                days: [
                    { weekday: "monday", ...closed },
                    { weekday: "tuesday", ...closed },
                    { weekday: "wednesday", isOpen: true, openingTime, closingTime },
                    { weekday: "thursday", ...closed },
                    { weekday: "friday", ...closed },
                    { weekday: "saturday", ...closed },
                    { weekday: "sunday", ...closed },
                ],
            },
        ],
    };
}

const schedules = openWednesdays("09:10", "10:00");

const wednesday = new Date("2025-05-14T10:00:00Z");
const thursday = new Date("2025-05-15T10:00:00Z");

describe("getRescheduleTimeSlots", () => {
    it("offers nothing until a date is picked and the schedules have loaded", () => {
        const empty = { slots: [], firstAvailable: null, errorKey: null };
        expect(getRescheduleTimeSlots(null, schedules, 15)).toEqual(empty);
        expect(getRescheduleTimeSlots(wednesday, null, 15)).toEqual(empty);
    });

    it("explains a closed day", () => {
        expect(getRescheduleTimeSlots(thursday, schedules, 15)).toEqual({
            slots: [],
            firstAvailable: null,
            errorKey: "dateUnavailable",
        });
    });

    it("starts at opening time", () => {
        const result = getRescheduleTimeSlots(wednesday, schedules, 15);
        expect(result.slots.map(slot => slot.value)).toEqual(["09:10", "09:25", "09:40"]);
        expect(result.firstAvailable).toBe("09:10");
        expect(result.errorKey).toBeNull();
    });

    it("offers a slot that fills the whole opening window", () => {
        // A grid counted from the hour moved this to 10:45 and offered nothing
        const result = getRescheduleTimeSlots(wednesday, openWednesdays("10:30", "11:15"), 45);
        expect(result.slots.map(slot => slot.value)).toEqual(["10:30"]);
        expect(result.errorKey).toBeNull();
    });

    it("counts slots from opening time, not from the hour or midnight", () => {
        // From the hour: 10:45. From midnight: 10:30, 11:15. Server and week grid: 10:15, 11:00
        const result = getRescheduleTimeSlots(wednesday, openWednesdays("10:15", "12:00"), 45);
        expect(result.slots.map(slot => slot.value)).toEqual(["10:15", "11:00"]);
    });

    it("says no times are available when no slot fits before closing", () => {
        const result = getRescheduleTimeSlots(wednesday, schedules, 60);
        expect(result.slots).toEqual([]);
        expect(result.errorKey).toBe("noTimesAvailable");
    });
});

describe("selectedRescheduleTime", () => {
    const quarterHours = getRescheduleTimeSlots(wednesday, schedules, 15);

    it("takes the first available time until the user picks one", () => {
        expect(selectedRescheduleTime(quarterHours, undefined)).toBe("09:10");
    });

    it("keeps the user's pick while it is offered", () => {
        expect(selectedRescheduleTime(quarterHours, "09:40")).toBe("09:40");
    });

    it("stays empty once the user clears the pick", () => {
        expect(selectedRescheduleTime(quarterHours, null)).toBeNull();
    });

    it("drops a pick the slots no longer offer", () => {
        // 09:40 was picked with 15-minute slots; the location uses 20-minute ones
        const twentyMinutes = getRescheduleTimeSlots(wednesday, schedules, 20);
        expect(twentyMinutes.slots.map(slot => slot.value)).not.toContain("09:40");
        expect(selectedRescheduleTime(twentyMinutes, "09:40")).toBe(twentyMinutes.firstAvailable);
    });
});
