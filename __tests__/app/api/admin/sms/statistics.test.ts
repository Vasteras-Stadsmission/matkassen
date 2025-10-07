/**
 * Tests for SMS statistics API route
 * Specifically covers the division-by-zero edge case when only pending messages exist
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "@/app/api/admin/sms/statistics/route";
import { NextRequest } from "next/server";
import * as db from "@/app/db/drizzle";
import * as apiAuth from "@/app/utils/auth/api-auth";

// Mock the auth module
vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(),
}));

// Mock the database
vi.mock("@/app/db/drizzle", () => ({
    db: {
        select: vi.fn(),
    },
}));

describe("SMS Statistics API - Division by Zero Guard", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock successful authentication
        vi.mocked(apiAuth.authenticateAdminRequest).mockResolvedValue({
            success: true,
            session: {
                user: { id: "test-user", email: "test@example.com" },
            } as any,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("should return 100% success rate when only queued messages exist (no finalized messages)", async () => {
        // Mock database to return only queued messages (no sent or failed)
        const mockDbChain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockResolvedValue([{ id: "loc1", name: "Location 1" }]),
            innerJoin: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockResolvedValue([
                { status: "queued", count: 5 },
                { status: "sending", count: 3 },
            ]),
        };

        vi.mocked(db.db.select).mockReturnValue(mockDbChain as any);

        const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();

        // Should have one location
        expect(data).toHaveLength(1);
        expect(data[0].locationId).toBe("loc1");

        // Success rate should be 100% (default) not NaN or null
        expect(data[0].last7Days.successRate).toBe(100);
        expect(data[0].last7Days.successRate).not.toBeNaN();
    });

    it("should calculate correct success rate when finalized messages exist", async () => {
        // Mock database to return sent and failed messages
        const mockDbChain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockResolvedValue([{ id: "loc1", name: "Location 1" }]),
            innerJoin: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockResolvedValue([
                { status: "sent", count: 8 },
                { status: "failed", count: 2 },
                { status: "queued", count: 1 },
            ]),
        };

        vi.mocked(db.db.select).mockReturnValue(mockDbChain as any);

        const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();

        expect(data).toHaveLength(1);

        // Success rate should be 80% (8 sent / (8 sent + 2 failed) = 0.8)
        expect(data[0].last7Days.successRate).toBe(80);
    });

    it("should handle 100% success rate correctly", async () => {
        // Mock database to return only sent messages (no failures)
        const mockDbChain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockResolvedValue([{ id: "loc1", name: "Location 1" }]),
            innerJoin: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockResolvedValue([
                { status: "sent", count: 10 },
                { status: "queued", count: 2 },
            ]),
        };

        vi.mocked(db.db.select).mockReturnValue(mockDbChain as any);

        const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();

        // Success rate should be 100%
        expect(data[0].last7Days.successRate).toBe(100);
    });

    it("should handle 0% success rate correctly", async () => {
        // Mock database to return only failed messages (no successes)
        const mockDbChain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockResolvedValue([{ id: "loc1", name: "Location 1" }]),
            innerJoin: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockResolvedValue([
                { status: "failed", count: 5 },
                { status: "queued", count: 1 },
            ]),
        };

        vi.mocked(db.db.select).mockReturnValue(mockDbChain as any);

        const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();

        // Success rate should be 0%
        expect(data[0].last7Days.successRate).toBe(0);
    });

    it("should handle empty result set gracefully", async () => {
        // Mock database to return no locations
        const mockDbChain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockResolvedValue([]),
        };

        vi.mocked(db.db.select).mockReturnValue(mockDbChain as any);

        const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toEqual([]);
    });

    it("should filter by location when location parameter provided", async () => {
        const mockDbChain = {
            from: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockResolvedValue([{ id: "loc1", name: "Location 1" }]),
            innerJoin: vi.fn().mockReturnThis(),
            groupBy: vi.fn().mockResolvedValue([{ status: "sent", count: 5 }]),
        };

        vi.mocked(db.db.select).mockReturnValue(mockDbChain as any);

        const request = new NextRequest(
            "http://localhost:3000/api/admin/sms/statistics?location=loc1",
        );
        const response = await GET(request);

        expect(response.status).toBe(200);
        const data = await response.json();
        expect(data).toHaveLength(1);
        expect(data[0].locationId).toBe("loc1");
    });
});
