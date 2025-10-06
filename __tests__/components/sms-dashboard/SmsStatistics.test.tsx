/**
 * Tests for SmsStatistics component - Division by Zero Guard
 * Tests the client-side aggregate success rate calculation logic
 */
import { describe, it, expect } from "vitest";
import type { SmsStatisticsRecord } from "@/app/api/admin/sms/statistics/route";

describe("SmsStatistics - Division by Zero Guard (Logic Tests)", () => {
    /**
     * This function replicates the client-side success rate calculation
     * from the SmsStatistics component to test the division-by-zero guard
     */
    function calculateSuccessRate(statistics: SmsStatisticsRecord[]): number {
        // Replicate the aggregate logic from the component
        const aggregateStats = statistics.reduce(
            (acc, stat) => ({
                last7Days: {
                    sent: acc.last7Days.sent + stat.last7Days.sent,
                    failed: acc.last7Days.failed + stat.last7Days.failed,
                    total: acc.last7Days.total + stat.last7Days.total,
                },
            }),
            {
                last7Days: { sent: 0, failed: 0, total: 0 },
            },
        );

        // Guard against division by zero when all messages are still pending
        const successRate =
            aggregateStats.last7Days.sent + aggregateStats.last7Days.failed > 0
                ? Math.round(
                      (aggregateStats.last7Days.sent /
                          (aggregateStats.last7Days.sent + aggregateStats.last7Days.failed)) *
                          1000,
                  ) / 10
                : 100;

        return successRate;
    }

    it("should return 100% success rate when only queued messages exist (no finalized messages)", () => {
        // Mock statistics with only queued messages (no sent or failed)
        const mockStats: SmsStatisticsRecord[] = [
            {
                locationId: "loc1",
                locationName: "Location 1",
                today: {
                    sent: 0,
                    failed: 0,
                    pending: 5,
                },
                last7Days: {
                    sent: 0,
                    failed: 0,
                    total: 8,
                    successRate: 100, // API returns 100 for no finalized messages
                },
                currentMonth: {
                    sent: 0,
                    failed: 0,
                    total: 10,
                },
                lastMonth: {
                    sent: 50,
                    failed: 2,
                    total: 52,
                },
            },
        ];

        const successRate = calculateSuccessRate(mockStats);

        // Success rate should be 100% (default) not NaN or null
        expect(successRate).toBe(100);
        expect(successRate).not.toBeNaN();
    });

    it("should calculate correct success rate when finalized messages exist", () => {
        // Mock statistics with sent and failed messages
        const mockStats: SmsStatisticsRecord[] = [
            {
                locationId: "loc1",
                locationName: "Location 1",
                today: {
                    sent: 5,
                    failed: 1,
                    pending: 2,
                },
                last7Days: {
                    sent: 8,
                    failed: 2,
                    total: 12,
                    successRate: 80,
                },
                currentMonth: {
                    sent: 20,
                    failed: 3,
                    total: 25,
                },
                lastMonth: {
                    sent: 30,
                    failed: 2,
                    total: 32,
                },
            },
        ];

        const successRate = calculateSuccessRate(mockStats);

        // Success rate should be 80% (8 sent / (8 sent + 2 failed) = 0.8)
        expect(successRate).toBe(80);
    });

    it("should handle 100% success rate correctly", () => {
        // Mock statistics with only sent messages (no failures)
        const mockStats: SmsStatisticsRecord[] = [
            {
                locationId: "loc1",
                locationName: "Location 1",
                today: {
                    sent: 10,
                    failed: 0,
                    pending: 2,
                },
                last7Days: {
                    sent: 10,
                    failed: 0,
                    total: 12,
                    successRate: 100,
                },
                currentMonth: {
                    sent: 25,
                    failed: 0,
                    total: 27,
                },
                lastMonth: {
                    sent: 30,
                    failed: 1,
                    total: 31,
                },
            },
        ];

        const successRate = calculateSuccessRate(mockStats);

        // Success rate should be 100%
        expect(successRate).toBe(100);
    });

    it("should handle 0% success rate correctly", () => {
        // Mock statistics with only failed messages (no successes)
        const mockStats: SmsStatisticsRecord[] = [
            {
                locationId: "loc1",
                locationName: "Location 1",
                today: {
                    sent: 0,
                    failed: 5,
                    pending: 1,
                },
                last7Days: {
                    sent: 0,
                    failed: 5,
                    total: 6,
                    successRate: 0,
                },
                currentMonth: {
                    sent: 0,
                    failed: 8,
                    total: 9,
                },
                lastMonth: {
                    sent: 25,
                    failed: 2,
                    total: 27,
                },
            },
        ];

        const successRate = calculateSuccessRate(mockStats);

        // Success rate should be 0%
        expect(successRate).toBe(0);
    });

    it("should calculate correct aggregate success rate from multiple locations", () => {
        // Mock statistics with multiple locations, some with only pending messages
        const mockStats: SmsStatisticsRecord[] = [
            {
                locationId: "loc1",
                locationName: "Location 1",
                today: {
                    sent: 5,
                    failed: 1,
                    pending: 2,
                },
                last7Days: {
                    sent: 8,
                    failed: 2,
                    total: 12,
                    successRate: 80,
                },
                currentMonth: {
                    sent: 20,
                    failed: 3,
                    total: 25,
                },
                lastMonth: {
                    sent: 30,
                    failed: 2,
                    total: 32,
                },
            },
            {
                locationId: "loc2",
                locationName: "Location 2",
                today: {
                    sent: 0,
                    failed: 0,
                    pending: 5,
                },
                last7Days: {
                    sent: 0,
                    failed: 0,
                    total: 5,
                    successRate: 100,
                },
                currentMonth: {
                    sent: 0,
                    failed: 0,
                    total: 5,
                },
                lastMonth: {
                    sent: 15,
                    failed: 1,
                    total: 16,
                },
            },
        ];

        const successRate = calculateSuccessRate(mockStats);

        // Aggregate should be: 8 sent / (8 sent + 2 failed) = 80%
        // Not affected by the location with 0 finalized messages
        expect(successRate).toBe(80);
    });

    it("should handle all locations with only pending messages", () => {
        // Mock statistics where all locations only have pending messages
        const mockStats: SmsStatisticsRecord[] = [
            {
                locationId: "loc1",
                locationName: "Location 1",
                today: {
                    sent: 0,
                    failed: 0,
                    pending: 3,
                },
                last7Days: {
                    sent: 0,
                    failed: 0,
                    total: 5,
                    successRate: 100,
                },
                currentMonth: {
                    sent: 0,
                    failed: 0,
                    total: 8,
                },
                lastMonth: {
                    sent: 20,
                    failed: 1,
                    total: 21,
                },
            },
            {
                locationId: "loc2",
                locationName: "Location 2",
                today: {
                    sent: 0,
                    failed: 0,
                    pending: 7,
                },
                last7Days: {
                    sent: 0,
                    failed: 0,
                    total: 10,
                    successRate: 100,
                },
                currentMonth: {
                    sent: 0,
                    failed: 0,
                    total: 15,
                },
                lastMonth: {
                    sent: 25,
                    failed: 2,
                    total: 27,
                },
            },
        ];

        const successRate = calculateSuccessRate(mockStats);

        // Client-side aggregate should also be 100% (no finalized messages across all locations)
        expect(successRate).toBe(100);
        expect(successRate).not.toBeNaN();
    });

    it("should handle empty statistics array", () => {
        const mockStats: SmsStatisticsRecord[] = [];

        const successRate = calculateSuccessRate(mockStats);

        // Should return 100% for empty array (no failures = 100% success)
        expect(successRate).toBe(100);
        expect(successRate).not.toBeNaN();
    });
});
