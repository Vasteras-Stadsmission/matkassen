import { describe, expect, it, mock } from "bun:test";
import { getISOWeekNumber, getWeekDates } from "@/app/schedule/actions";

// Mock the server-side functions for client-side testing
mock("@/app/schedule/actions", () => ({
    getISOWeekNumber: async (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
        const yearStart = new Date(d.getFullYear(), 0, 1);
        const weekNumber = Math.floor(1 + 0.5 + (d.getTime() - yearStart.getTime()) / 86400000 / 7);
        return weekNumber;
    },
    getWeekDates: async (date: Date) => {
        const d = new Date(date);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday

        const start = new Date(d.setDate(diff));
        start.setHours(0, 0, 0, 0);

        const end = new Date(d);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);

        return { start, end };
    },
}));

describe("Schedule Date Utilities", () => {
    describe("getISOWeekNumber", () => {
        it("returns correct week number for a date in January", async () => {
            const date = new Date("2025-01-15"); // A Wednesday in January 2025
            const weekNumber = await getISOWeekNumber(date);
            expect(weekNumber).toBe(3); // Should be week 3
        });

        it("returns correct week number for a date at year boundary", async () => {
            const date = new Date("2024-12-31"); // Tuesday Dec 31, 2024 (week 1 of 2025 in ISO)
            const weekNumber = await getISOWeekNumber(date);
            expect(weekNumber).toBe(1); // ISO week 1 of 2025
        });

        it("returns correct week number for a date in the middle of the year", async () => {
            const date = new Date("2025-07-15");
            const weekNumber = await getISOWeekNumber(date);
            expect(weekNumber).toBe(29); // Should be week 29
        });
    });

    describe("getWeekDates", () => {
        it("returns correct week start (Monday) and end (Sunday) for a weekday", async () => {
            // Wednesday, April 16, 2025
            const date = new Date("2025-04-16");
            const { start, end } = await getWeekDates(date);

            // Should start on Monday, April 14, 2025
            expect(start.getFullYear()).toBe(2025);
            expect(start.getMonth()).toBe(3); // April (0-indexed)
            expect(start.getDate()).toBe(14);
            expect(start.getHours()).toBe(0);
            expect(start.getMinutes()).toBe(0);
            expect(start.getSeconds()).toBe(0);

            // Should end on Sunday, April 20, 2025
            expect(end.getFullYear()).toBe(2025);
            expect(end.getMonth()).toBe(3); // April (0-indexed)
            expect(end.getDate()).toBe(20);
            expect(end.getHours()).toBe(23);
            expect(end.getMinutes()).toBe(59);
            expect(end.getSeconds()).toBe(59);
        });

        it("returns correct week when the date is a Monday", async () => {
            // Monday, April 14, 2025
            const date = new Date("2025-04-14");
            const { start, end } = await getWeekDates(date);

            // Start should be the same Monday
            expect(start.getDate()).toBe(14);

            // End should be the following Sunday
            expect(end.getDate()).toBe(20);
        });

        it("returns correct week when the date is a Sunday", async () => {
            // Sunday, April 20, 2025
            const date = new Date("2025-04-20");
            const { start, end } = await getWeekDates(date);

            // Should start on Monday, April 14, 2025
            expect(start.getDate()).toBe(14);

            // End should be the same Sunday
            expect(end.getDate()).toBe(20);
        });

        it("handles week spanning across month boundaries", async () => {
            // Wednesday, April 30, 2025
            const date = new Date("2025-04-30");
            const { start, end } = await getWeekDates(date);

            // Should start on Monday, April 28, 2025
            expect(start.getMonth()).toBe(3); // April
            expect(start.getDate()).toBe(28);

            // Should end on Sunday, May 4, 2025
            expect(end.getMonth()).toBe(4); // May
            expect(end.getDate()).toBe(4);
        });

        it("handles week spanning across year boundaries", async () => {
            // Wednesday, December 31, 2025
            const date = new Date("2025-12-31");
            const { start, end } = await getWeekDates(date);

            // Should start on Monday, December 29, 2025
            expect(start.getFullYear()).toBe(2025);
            expect(start.getMonth()).toBe(11); // December
            expect(start.getDate()).toBe(29);

            // Should end on Sunday, January 4, 2026
            expect(end.getFullYear()).toBe(2026);
            expect(end.getMonth()).toBe(0); // January
            expect(end.getDate()).toBe(4);
        });
    });
});
