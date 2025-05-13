import { describe, expect, it } from "bun:test";
import {
    findTimeGaps,
    formatDuration,
} from "@/app/[locale]/schedule/components/WeeklyScheduleGrid";

describe("Time Slot Utilities", () => {
    describe("findTimeGaps", () => {
        it("correctly identifies gaps between time slots", () => {
            const timeSlots = ["10:00", "19:45"];

            const gaps = findTimeGaps(timeSlots);

            expect(gaps.length).toBe(1);
            expect(gaps[0].startTime).toBe("10:00");
            expect(gaps[0].endTime).toBe("19:45");
            // Calculate the exact gap duration (9 hours 45 minutes = 585 minutes)
            expect(gaps[0].durationMinutes).toBe(585);
        });

        it("identifies multiple gaps in a sequence of time slots", () => {
            const timeSlots = ["07:00", "08:30", "12:00", "17:30", "21:00"];

            const gaps = findTimeGaps(timeSlots);

            expect(gaps.length).toBe(4);

            // Gap 1: 07:00 to 08:30 (1.5 hours = 90 minutes)
            expect(gaps[0].startTime).toBe("07:00");
            expect(gaps[0].endTime).toBe("08:30");
            expect(gaps[0].durationMinutes).toBe(90);

            // Gap 2: 08:30 to 12:00 (3.5 hours = 210 minutes)
            expect(gaps[1].startTime).toBe("08:30");
            expect(gaps[1].endTime).toBe("12:00");
            expect(gaps[1].durationMinutes).toBe(210);

            // Gap 3: 12:00 to 17:30 (5.5 hours = 330 minutes)
            expect(gaps[2].startTime).toBe("12:00");
            expect(gaps[2].endTime).toBe("17:30");
            expect(gaps[2].durationMinutes).toBe(330);

            // Gap 4: 17:30 to 21:00 (3.5 hours = 210 minutes)
            expect(gaps[3].startTime).toBe("17:30");
            expect(gaps[3].endTime).toBe("21:00");
            expect(gaps[3].durationMinutes).toBe(210);
        });

        it("ignores small gaps that are less than the typical slot interval", () => {
            // These are 15 minutes apart, which should be considered consecutive slots
            const timeSlots = ["10:00", "10:15", "10:30", "10:45"];

            const gaps = findTimeGaps(timeSlots);

            expect(gaps.length).toBe(0);
        });

        it("handles empty or single-slot arrays", () => {
            expect(findTimeGaps([])).toEqual([]);
            expect(findTimeGaps(["10:00"])).toEqual([]);
        });

        it("works with unsorted input", () => {
            const timeSlots = ["19:45", "10:00"]; // deliberately unsorted

            const gaps = findTimeGaps(timeSlots);

            expect(gaps.length).toBe(1);
            expect(gaps[0].startTime).toBe("10:00");
            expect(gaps[0].endTime).toBe("19:45");
            expect(gaps[0].durationMinutes).toBe(585);
        });
    });

    describe("formatDuration", () => {
        it("formats hours only when minutes are zero", () => {
            expect(formatDuration(60)).toBe("1 hour");
            expect(formatDuration(120)).toBe("2 hours");
            expect(formatDuration(180)).toBe("3 hours");
        });

        it("formats minutes only when less than an hour", () => {
            expect(formatDuration(15)).toBe("15 min");
            expect(formatDuration(30)).toBe("30 min");
            expect(formatDuration(45)).toBe("45 min");
        });

        it("formats hours and minutes for mixed durations", () => {
            expect(formatDuration(75)).toBe("1h 15m");
            expect(formatDuration(90)).toBe("1h 30m");
            expect(formatDuration(585)).toBe("9h 45m"); // Our specific test case
        });

        it("handles edge cases", () => {
            expect(formatDuration(0)).toBe("0 min");
            expect(formatDuration(1)).toBe("1 min");
            expect(formatDuration(59)).toBe("59 min");
            expect(formatDuration(61)).toBe("1h 1m");
        });
    });
});
