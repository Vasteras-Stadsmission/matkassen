/**
 * @vitest-environment node
 *
 * Tests for SMS Failure Count API endpoint
 *
 * Coverage areas:
 * 1. Authentication and authorization
 * 2. Count query for failed SMS with proper filters
 * 3. Time window logic - counts failures until pickup window ends (pickup_date_time_latest)
 * 4. Only counts active (non-deleted) parcels
 *
 * This endpoint is critical for the badge notification in the UI showing staff
 * how many failed SMS need attention.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET } from "@/app/api/admin/sms/failure-count/route";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

// Mock the auth function
vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(),
}));

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);

describe("GET /api/admin/sms/failure-count", () => {
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

            const response = await GET();

            expect(response.status).toBe(401);
        });

        it("should allow access when authentication succeeds", async () => {
            const response = await GET();

            // Should return 200 (database will return 0 count from mock)
            expect(response.status).toBe(200);
            expect(mockAuthenticateAdminRequest).toHaveBeenCalledOnce();
        });
    });

    describe("Response format", () => {
        it("should return JSON with count property", async () => {
            const response = await GET();

            expect(response.status).toBe(200);
            expect(response.headers.get("content-type")).toContain("application/json");

            const data = await response.json();
            expect(data).toHaveProperty("count");
            expect(typeof data.count).toBe("number");
        });

        it("should return zero count when no failures exist", async () => {
            const response = await GET();
            const data = await response.json();

            expect(data.count).toBe(0);
        });
    });
});

/**
 * Integration tests for SMS failure count are in:
 * __tests__/integration/sms/failures.integration.test.ts
 *
 * The integration tests verify:
 * - Count accuracy (only "failed" status)
 * - Only active parcels (notDeleted)
 * - Only upcoming parcels (pickup_date_time_latest >= NOW)
 * - Consistency between failure count and failures list
 *
 * The failures list and failure count use the same query logic,
 * so the integration tests cover both endpoints.
 */
