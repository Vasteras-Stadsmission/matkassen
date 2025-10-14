import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration } from "@/app/utils/duration-parser";

describe("parseDuration", () => {
    describe("long format durations", () => {
        it("parses years correctly (uses 365.25 days for leap year accuracy)", () => {
            expect(parseDuration("1 year")).toBe(31557600000); // 365.25 days
        });

        it("parses weeks correctly", () => {
            expect(parseDuration("1 week")).toBe(604800000);
            expect(parseDuration("2 weeks")).toBe(1209600000);
        });

        it("parses days correctly", () => {
            expect(parseDuration("365 days")).toBe(31536000000); // Exactly 365 days
            expect(parseDuration("7 days")).toBe(604800000);
            expect(parseDuration("1 day")).toBe(86400000);
        });

        it("parses minutes correctly", () => {
            expect(parseDuration("5 minutes")).toBe(300000);
            expect(parseDuration("1 minute")).toBe(60000);
        });

        it("parses seconds correctly", () => {
            expect(parseDuration("30 seconds")).toBe(30000);
            expect(parseDuration("1 second")).toBe(1000);
        });

        it("parses hours correctly", () => {
            expect(parseDuration("2 hours")).toBe(7200000);
            expect(parseDuration("1 hour")).toBe(3600000);
        });
    });

    describe("short format durations", () => {
        it("parses abbreviated time units", () => {
            expect(parseDuration("1y")).toBe(31557600000); // 365.25 days
            expect(parseDuration("365d")).toBe(31536000000); // Exactly 365 days
            expect(parseDuration("7d")).toBe(604800000);
            expect(parseDuration("5m")).toBe(300000);
            expect(parseDuration("30s")).toBe(30000);
            expect(parseDuration("2h")).toBe(7200000);
        });

        it("does NOT support months (M = minutes, not months)", () => {
            // IMPORTANT: "12M" means 12 MINUTES, not 12 months!
            expect(parseDuration("12M")).toBe(720000); // 12 minutes
        });
    });

    describe("error handling", () => {
        it("throws error for invalid formats", () => {
            expect(() => parseDuration("invalid")).toThrow();
            expect(() => parseDuration("not a duration")).toThrow();
        });

        it("throws error for empty strings", () => {
            expect(() => parseDuration("")).toThrow();
        });

        it("throws error for negative durations", () => {
            expect(() => parseDuration("-5 minutes")).toThrow("Invalid duration format");
        });

        it("throws error for zero duration", () => {
            expect(() => parseDuration("0 seconds")).toThrow("Invalid duration format");
        });
    });

    describe("real-world scenarios", () => {
        it("handles production GDPR anonymization threshold (1 year)", () => {
            const duration = parseDuration("1 year");
            const days = duration / (24 * 60 * 60 * 1000);
            expect(days).toBeCloseTo(365.25, 0); // Should be approximately 365.25 days
        });

        it("handles staging test duration", () => {
            const duration = parseDuration("5 minutes");
            expect(duration).toBe(5 * 60 * 1000);
        });

        it("handles local development test duration", () => {
            const duration = parseDuration("30 seconds");
            expect(duration).toBe(30 * 1000);
        });
    });
});

describe("formatDuration", () => {
    it("formats milliseconds to short format by default", () => {
        // NOTE: ms library formats 365.25 days back as "365d" (not "1y")
        expect(formatDuration(31557600000)).toBe("365d"); // 365.25 days
        expect(formatDuration(300000)).toBe("5m");
        expect(formatDuration(30000)).toBe("30s");
        expect(formatDuration(7200000)).toBe("2h");
        expect(formatDuration(604800000)).toBe("7d");
    });

    it("formats milliseconds to long format when specified", () => {
        // NOTE: ms library formats 365.25 days back as "365 days" (not "1 year")
        expect(formatDuration(31557600000, true)).toBe("365 days"); // 365.25 days
        expect(formatDuration(300000, true)).toBe("5 minutes");
        expect(formatDuration(30000, true)).toBe("30 seconds");
        expect(formatDuration(7200000, true)).toBe("2 hours");
        expect(formatDuration(604800000, true)).toBe("7 days");
    });
});

/**
 * Documentation Test: Duration Parser Configuration
 *
 * This test documents how to configure anonymization duration across environments.
 */
describe("Duration Parser Configuration Documentation", () => {
    it("documents environment-specific duration configuration", () => {
        // Production: GDPR compliance - anonymize households inactive for 1 year
        // NOTE: ms library does NOT support "months" (use "1 year" or "365 days")
        const productionDuration = "1 year";
        expect(parseDuration(productionDuration)).toBe(31557600000); // 365.25 days

        // Staging: Fast testing - anonymize after 5 minutes
        const stagingDuration = "5 minutes";
        expect(parseDuration(stagingDuration)).toBe(300000);

        // Local development: Immediate testing - anonymize after 30 seconds
        const localDuration = "30 seconds";
        expect(parseDuration(localDuration)).toBe(30000);

        // All formats are human-readable and self-documenting
        expect(parseDuration("1 year")).toBeGreaterThan(0);
        expect(parseDuration("365 days")).toBeGreaterThan(0);
        expect(parseDuration("1 week")).toBeGreaterThan(0);
    });

    it("documents conversion to months for database queries", () => {
        const durationMs = parseDuration("1 year");
        const inactiveMonths = durationMs / (30 * 24 * 60 * 60 * 1000);

        // This is how the scheduler converts duration to months for database filtering
        // 1 year (365.25 days) ≈ 12.18 months
        expect(inactiveMonths).toBeCloseTo(12.18, 1);
    });

    it("warns that 'months' is NOT supported by ms library", () => {
        // ms library does NOT support months because months have variable lengths
        // Use "1 year" (365.25 days) or "365 days" instead
        expect(() => parseDuration("12 months")).toThrow();

        // Use these instead:
        expect(parseDuration("1 year")).toBe(31557600000); // Recommended (accounts for leap years)
        expect(parseDuration("365 days")).toBe(31536000000); // Alternative (exact 365 days)
    });
});
