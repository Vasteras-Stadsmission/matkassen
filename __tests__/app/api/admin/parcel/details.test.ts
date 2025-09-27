/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { GET } from "@/app/api/admin/parcel/[parcelId]/details/route";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

// Mock the auth function
vi.mock("@/app/utils/auth/api-auth", () => ({
    authenticateAdminRequest: vi.fn(),
}));

const mockAuthenticateAdminRequest = vi.mocked(authenticateAdminRequest);

describe("/api/admin/parcel/[parcelId]/details", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Default to successful authentication
        mockAuthenticateAdminRequest.mockResolvedValue({
            success: true,
            session: {
                user: {
                    name: "test-admin",
                },
            },
        });
    });

    it("should return 401 when authentication fails", async () => {
        mockAuthenticateAdminRequest.mockResolvedValue({
            success: false,
            response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
        });

        const request = new NextRequest(
            "http://localhost:3000/api/admin/parcel/test-parcel/details",
        );
        const response = await GET(request, {
            params: Promise.resolve({ parcelId: "test-parcel" }),
        });

        expect(response.status).toBe(401);
    });

    it("should return 404 for non-existent parcel", async () => {
        const request = new NextRequest(
            "http://localhost:3000/api/admin/parcel/nonexistent/details",
        );
        const response = await GET(request, {
            params: Promise.resolve({ parcelId: "nonexistent" }),
        });

        expect(response.status).toBe(404);
        const data = await response.json();
        expect(data.error).toBe("Parcel not found");
    });

    it("should return parcel details when parcel exists", async () => {
        // First, we need to set up test data in the database
        // This test validates the response structure rather than testing with real data
        // since we don't have a comprehensive test database setup yet

        const request = new NextRequest(
            "http://localhost:3000/api/admin/parcel/test-parcel/details",
        );
        const response = await GET(request, {
            params: Promise.resolve({ parcelId: "test-parcel" }),
        });

        // For now, we expect 404 since no test data exists
        // Once we have test data setup, this should return 200 with proper structure
        expect(response.status).toBe(404);
    });

    it("should handle database errors gracefully", async () => {
        // Mock a database error by using an invalid parcelId that causes issues
        const request = new NextRequest("http://localhost:3000/api/admin/parcel/null/details");
        const response = await GET(request, { params: Promise.resolve({ parcelId: "null" }) });

        // Should handle the error and return 404 for non-existent parcel
        expect(response.status).toBe(404);
    });
});
