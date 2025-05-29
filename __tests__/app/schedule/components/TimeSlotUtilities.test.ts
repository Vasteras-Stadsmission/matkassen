import { describe, expect, it } from "bun:test";
import { formatDuration } from "@/app/[locale]/schedule/components/WeeklyScheduleGrid";

describe("Time Slot Utilities", () => {
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
