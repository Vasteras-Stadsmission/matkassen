/**
 * Tests for SMS Statistics Utilities
 */
import { describe, it, expect } from "vitest";
import { calculateSuccessRate } from "@/app/utils/sms/statistics";

describe("calculateSuccessRate", () => {
    it("should return 100% when no messages have been finalized (both sent and failed are 0)", () => {
        const result = calculateSuccessRate(0, 0);
        expect(result).toBe(100);
        expect(result).not.toBeNaN();
    });

    it("should return 100% when all messages were sent successfully (no failures)", () => {
        const result = calculateSuccessRate(10, 0);
        expect(result).toBe(100);
    });

    it("should return 0% when all messages failed (no successes)", () => {
        const result = calculateSuccessRate(0, 5);
        expect(result).toBe(0);
    });

    it("should calculate 80% success rate correctly", () => {
        const result = calculateSuccessRate(8, 2);
        expect(result).toBe(80);
    });

    it("should calculate success rate with one decimal place precision", () => {
        // 8 sent / (8 + 3 failed) = 0.7272... = 72.7%
        const result = calculateSuccessRate(8, 3);
        expect(result).toBe(72.7);
    });

    it("should round to one decimal place correctly (down)", () => {
        // 17 sent / (17 + 3 failed) = 0.85 = 85.0%
        const result = calculateSuccessRate(17, 3);
        expect(result).toBe(85);
    });

    it("should round to one decimal place correctly (up)", () => {
        // 6 sent / (6 + 1 failed) = 0.857142... = 85.7%
        const result = calculateSuccessRate(6, 1);
        expect(result).toBe(85.7);
    });

    it("should handle large numbers correctly", () => {
        const result = calculateSuccessRate(9500, 500);
        expect(result).toBe(95);
    });

    it("should handle edge case of 1 sent, 1 failed (50%)", () => {
        const result = calculateSuccessRate(1, 1);
        expect(result).toBe(50);
    });

    it("should handle very low success rate", () => {
        const result = calculateSuccessRate(1, 99);
        expect(result).toBe(1);
    });

    it("should handle 99.9% success rate", () => {
        const result = calculateSuccessRate(999, 1);
        expect(result).toBe(99.9);
    });
});
