import { describe, it, expect, vi } from "vitest";
import { getWeekDates } from "../app/utils/date-utils";

// Use the exact same mocks as date-utils.test.ts
vi.mock("date-fns-tz", () => ({
    toZonedTime: (date: Date | number | string) => date,
    fromZonedTime: (date: Date | number | string) => date,
    formatInTimeZone: (date: Date | number | string, tz: string, format: string) => date.toString(),
    getTimezoneOffset: () => 0,
}));

vi.mock("date-fns", () => ({
    getISOWeek: (date: Date) => {
        const dateStr = date.toISOString().split("T")[0];
        if (dateStr === "2025-01-15") return 3;
        if (dateStr === "2024-12-31") return 1;
        if (dateStr === "2025-07-15") return 29;
        return 1;
    },
    startOfWeek: (date: Date, options?: { weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 }) => {
        const dateStr = date.toISOString().split("T")[0];

        if (dateStr === "2025-04-16") return new Date("2025-04-13T00:00:00.000Z");
        if (dateStr === "2025-04-14") return new Date("2025-04-13T00:00:00.000Z");
        if (dateStr === "2025-04-20") return new Date("2025-04-13T00:00:00.000Z");
        if (dateStr === "2025-04-30") return new Date("2025-04-27T00:00:00.000Z");
        if (dateStr === "2025-12-31") return new Date("2025-12-28T00:00:00.000Z");

        return new Date(date);
    },
    endOfWeek: (date: Date, options?: { weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6 }) => {
        const dateStr = date.toISOString().split("T")[0];

        if (dateStr === "2025-04-16") return new Date("2025-04-20T23:59:59.999Z");
        if (dateStr === "2025-04-14") return new Date("2025-04-20T23:59:59.999Z");
        if (dateStr === "2025-04-20") return new Date("2025-04-20T23:59:59.999Z");
        if (dateStr === "2025-04-30") return new Date("2025-05-04T23:59:59.999Z");
        if (dateStr === "2025-12-31") return new Date("2026-01-04T23:59:59.999Z");

        return new Date(date);
    },
    startOfDay: (date: Date) => date,
    endOfDay: (date: Date) => date,
    format: () => "",
    parseISO: () => new Date(),
    formatISO: () => "",
    addDays: () => new Date(),
}));

describe("Debug getWeekDates with mocks", () => {
    it("should show actual return values with mocks", () => {
        // Test case 1: Wednesday, April 16, 2025
        const date1 = new Date("2025-04-16");
        const result1 = getWeekDates(date1);
        console.log("\nDate: 2025-04-16 (Wednesday) with mocks");
        console.log("Start:", result1.start.toISOString(), "Date:", result1.start.getDate());
        console.log("End:", result1.end.toISOString(), "Date:", result1.end.getDate());

        // Test case 2: Wednesday, April 30, 2025
        const date2 = new Date("2025-04-30");
        const result2 = getWeekDates(date2);
        console.log("\nDate: 2025-04-30 (Wednesday) with mocks");
        console.log("Start:", result2.start.toISOString(), "Date:", result2.start.getDate());
        console.log("End:", result2.end.toISOString(), "Date:", result2.end.getDate());

        // Just to pass the test
        expect(true).toBe(true);
    });
});
