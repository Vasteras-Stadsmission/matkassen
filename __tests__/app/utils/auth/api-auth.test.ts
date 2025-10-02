/**
 * Tests for API route authentication
 * Verifies that API auth uses githubUsername instead of display name
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSession, createMockSessionWithDisplayName } from "../../../test-helpers";

// Mock the auth module
const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
    auth: () => mockAuth(),
}));

// Mock the organization auth module
const mockValidateOrganizationMembership = vi.fn();
vi.mock("@/app/utils/auth/organization-auth", () => ({
    validateOrganizationMembership: (username: string, context: string) =>
        mockValidateOrganizationMembership(username, context),
}));

// Mock rate limiting
vi.mock("@/app/utils/rate-limit", () => ({
    checkRateLimit: vi.fn(() => ({ allowed: true, remaining: 10, resetTime: Date.now() + 60000 })),
    getSmsRateLimitKey: vi.fn((endpoint: string, userId: string) => `${endpoint}:${userId}`),
}));

describe("API Authentication", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("authenticateAdminRequest", () => {
        it("should use githubUsername for organization check, not display name", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSessionWithDisplayName();
            mockAuth.mockResolvedValue(mockSession);
            mockValidateOrganizationMembership.mockResolvedValue({ isValid: true });

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(true);
            expect(mockValidateOrganizationMembership).toHaveBeenCalledWith("johndoe123", "api");
            expect(mockValidateOrganizationMembership).not.toHaveBeenCalledWith("John Doe", "api");
        });

        it("REGRESSION: user with display name should access API successfully", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSession({
                githubUsername: "johndoe123",
                name: "John Doe",
                email: "john@example.com",
            });

            mockAuth.mockResolvedValue(mockSession);
            mockValidateOrganizationMembership.mockResolvedValue({ isValid: true });

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(true);
            expect(result.session).toEqual(mockSession);
            expect(mockValidateOrganizationMembership).toHaveBeenCalledWith("johndoe123", "api");
        });

        it("should fail when githubUsername is missing", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = {
                user: {
                    name: "John Doe",
                    email: "john@example.com",
                },
            };

            mockAuth.mockResolvedValue(mockSession);

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(false);
            expect(result.response?.status).toBe(401);
        });

        it("should return 403 when organization membership check fails", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSession();
            mockAuth.mockResolvedValue(mockSession);
            mockValidateOrganizationMembership.mockResolvedValue({
                isValid: false,
                error: "User is not a member",
            });

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(false);
            expect(result.response?.status).toBe(403);
        });

        it("should return 500 for configuration errors", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSession();
            mockAuth.mockResolvedValue(mockSession);
            mockValidateOrganizationMembership.mockResolvedValue({
                isValid: false,
                error: "Server configuration error",
            });

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(false);
            expect(result.response?.status).toBe(500);
        });

        it("should work with users who have no display name", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSession({
                githubUsername: "johndoe123",
                name: null,
                email: "john@example.com",
            });

            mockAuth.mockResolvedValue(mockSession);
            mockValidateOrganizationMembership.mockResolvedValue({ isValid: true });

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(true);
            expect(mockValidateOrganizationMembership).toHaveBeenCalledWith("johndoe123", "api");
        });
    });
});
