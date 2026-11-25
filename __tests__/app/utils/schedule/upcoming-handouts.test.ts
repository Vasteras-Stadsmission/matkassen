import { describe, expect, it } from "vitest";
import {
    addDaysToDateKey,
    getHandoutCapacityLevel,
    pickUpcomingHandouts,
} from "@/app/utils/schedule/upcoming-handouts";

describe("getHandoutCapacityLevel", () => {
    it("marks a day almost full from 80 % of its limit", () => {
        expect(getHandoutCapacityLevel(15, 20)).toBe("available");
        expect(getHandoutCapacityLevel(16, 20)).toBe("almostFull");
        expect(getHandoutCapacityLevel(19, 20)).toBe("almostFull");
    });

    it("tells a full day from an over-booked one", () => {
        expect(getHandoutCapacityLevel(20, 20)).toBe("full");
        expect(getHandoutCapacityLevel(22, 20)).toBe("over");
    });

    it("never marks a day without a limit", () => {
        expect(getHandoutCapacityLevel(500, null)).toBe("unlimited");
    });
});

describe("pickUpcomingHandouts", () => {
    it("takes the first two days that are open or have bookings, in date order", () => {
        expect(
            pickUpcomingHandouts({
                openDates: ["2026-12-02", "2026-11-30"],
                bookedCounts: { "2026-11-28": 3, "2026-11-29": 0, "2026-12-02": 5 },
                effectiveDailyLimits: { "2026-11-28": 10, "2026-11-30": 10, "2026-12-02": 8 },
            }),
        ).toEqual([
            { date: "2026-11-28", booked: 3, limit: 10 },
            { date: "2026-11-30", booked: 0, limit: 10 },
        ]);
    });
});

describe("addDaysToDateKey", () => {
    it("crosses month and year ends", () => {
        expect(addDaysToDateKey("2026-12-31", 1)).toBe("2027-01-01");
        expect(addDaysToDateKey("2026-11-25", 14)).toBe("2026-12-09");
    });
});
