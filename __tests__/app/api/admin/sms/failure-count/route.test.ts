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
 * Integration test documentation for SMS Failure Count
 *
 * The following behaviors should be verified through integration testing with database fixtures:
 *
 * 1. **Count accuracy**:
 *    - Only counts SMS with status = "failed"
 *    - Only counts SMS for active parcels (deleted_at IS NULL)
 *    - Only counts SMS for upcoming parcels (pickup_date_time_latest >= NOW)
 *
 * 2. **Time window behavior** (CRITICAL - matches dashboard logic):
 *    - Counts failures until pickup window ENDS (pickup_date_time_latest)
 *    - NOT just until the window BEGINS (pickup_date_time_earliest)
 *    - Example: Parcel with pickup window 10:00-14:00 at 11:00 should count if failed
 *    - This ensures the badge count matches what staff see in the dashboard
 *
 * 3. **Filter consistency**:
 *    - Uses same filter logic as dashboard API
 *    - Badge count should match number of failed SMS visible in dashboard
 *    - Regression test: ensure dashboard and badge stay in sync
 *
 * Integration test scenarios to implement:
 *
 * Scenario 1: Failed SMS during active pickup window
 *   Given: Current time is 11:00
 *   And: Parcel A has pickup window 10:00-14:00 (active)
 *   And: Parcel A has SMS with status "failed"
 *   And: Parcel B has pickup window 08:00-10:00 (ended)
 *   And: Parcel B has SMS with status "failed"
 *   When: GET /api/admin/sms/failure-count
 *   Then: Returns count = 1 (only Parcel A)
 *
 * Scenario 2: Multiple failure statuses
 *   Given: SMS with status "failed" (count: 2)
 *   And: SMS with status "retrying" (count: 1)
 *   And: SMS with status "sent" (count: 3)
 *   When: GET /api/admin/sms/failure-count
 *   Then: Returns count = 2 (only "failed" status)
 *
 * Scenario 3: Active vs cancelled parcels
 *   Given: Active parcel with failed SMS (count: 1)
 *   And: Cancelled parcel with failed SMS (count: 2)
 *   When: GET /api/admin/sms/failure-count
 *   Then: Returns count = 1 (only active parcels)
 *
 * Scenario 4: Badge-dashboard consistency
 *   Given: Multiple parcels with various SMS statuses and time windows
 *   When: GET /api/admin/sms/failure-count returns count = N
 *   Then: GET /api/admin/sms/dashboard?status=failed returns N records
 *
 * These integration tests require a test database with fixtures.
 */

describe("Integration Test TODO", () => {
    it.todo(
        "should count failed SMS during active pickup window (between earliest and latest time)",
    );

    it.todo("should exclude failed SMS where current time > pickup_date_time_latest");

    it.todo("should only count SMS with status = 'failed'");

    it.todo("should only count SMS for active parcels (notDeleted)");

    it.todo("should match dashboard visible failure count");

    it.todo("should return correct count with multiple failed SMS");

    it.todo("should return zero when no failed SMS exist");
});
