import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/admin/sms/statistics/route";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

// Mock the auth function
vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(),
}));

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);

describe("GET /api/admin/sms/statistics", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Default to successful authentication
        mockAuthenticateAdminRequest.mockResolvedValue({
            success: true,
            session: {
                user: {
                    name: "test-admin",
                    githubUsername: "test-admin",
                },
            },
        });
    });

    describe("Authentication", () => {
        it("should return 401 when authentication fails", async () => {
            mockAuthenticateAdminRequest.mockResolvedValue({
                success: false,
                response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
            });

            const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
            const response = await GET(request);

            expect(response.status).toBe(401);
            const data = await response.json();
            expect(data).toEqual({ error: "Unauthorized" });
        });

        it("should proceed when authentication succeeds", async () => {
            const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
            const response = await GET(request);

            expect(mockAuthenticateAdminRequest).toHaveBeenCalled();
            expect(response.status).toBe(200);
        });
    });

    describe("Query Parameters", () => {
        it("should accept location filter parameter", async () => {
            const request = new NextRequest(
                "http://localhost:3000/api/admin/sms/statistics?location=test-location-id",
            );
            const response = await GET(request);

            expect(response.status).toBe(200);
            // The actual filtering is tested in integration tests with real data
        });

        it("should work without any filters", async () => {
            const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
            const response = await GET(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(Array.isArray(data)).toBe(true);
        });
    });

    describe("Response Format", () => {
        it("should return an array of statistics records", async () => {
            const request = new NextRequest("http://localhost:3000/api/admin/sms/statistics");
            const response = await GET(request);

            expect(response.status).toBe(200);
            const data = await response.json();
            expect(Array.isArray(data)).toBe(true);

            // Each record should have the correct structure
            data.forEach((record: unknown) => {
                expect(record).toHaveProperty("locationId");
                expect(record).toHaveProperty("locationName");
                expect(record).toHaveProperty("today");
                expect(record).toHaveProperty("last7Days");
                expect(record).toHaveProperty("currentMonth");
                expect(record).toHaveProperty("lastMonth");
            });
        });
    });
});

/**
 * Integration Test Scenarios:
 *
 * Scenario 1: Statistics for specific location
 *   Given: Location "Test Location" with ID "loc123"
 *   And: 10 SMS sent today, 2 failed today
 *   And: 50 SMS sent in last 7 days, 3 failed
 *   When: GET /api/admin/sms/statistics?location=loc123
 *   Then: Returns stats only for that location
 *   And: today.sent = 10, today.failed = 2
 *   And: last7Days.successRate = 94.3%
 *
 * Scenario 2: Statistics across all locations
 *   Given: Multiple locations with SMS
 *   When: GET /api/admin/sms/statistics
 *   Then: Returns array with stats for each location
 *   And: Each location has aggregated stats
 *
 * Scenario 3: Monthly comparison
 *   Given: Current month has 100 SMS sent
 *   And: Last month had 80 SMS sent
 *   When: GET /api/admin/sms/statistics
 *   Then: Shows +25% growth
 *
 * These integration tests require a test database with fixtures.
 * The unit tests above validate authentication and parameter parsing.
 */
