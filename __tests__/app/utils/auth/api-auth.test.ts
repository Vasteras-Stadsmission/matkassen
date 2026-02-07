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
        it("should allow users with display names when eligible", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSessionWithDisplayName();
            mockAuth.mockResolvedValue(mockSession);

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(true);
        });

        it("REGRESSION: user with display name should access API successfully", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSession({
                githubUsername: "johndoe123",
                name: "John Doe",
                email: "john@example.com",
            });

            mockAuth.mockResolvedValue(mockSession);

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(true);
            expect(result.session).toEqual(mockSession);
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

        it("should return 403 when organization eligibility is missing", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSession();
            (mockSession.user as any).orgEligibility = undefined;
            mockAuth.mockResolvedValue(mockSession);

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(false);
            expect(result.response?.status).toBe(403);
        });

        it("should return 403 when organization eligibility is not ok", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSession();
            (mockSession.user as any).orgEligibility = {
                ok: false,
                status: "not_member",
                checkedAt: 1,
                nextCheckAt: Number.MAX_SAFE_INTEGER,
            };
            mockAuth.mockResolvedValue(mockSession);

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(false);
            expect(result.response?.status).toBe(403);
        });

        it("should return 500 for configuration errors", async () => {
            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSession();
            mockAuth.mockResolvedValue(mockSession);
            (mockSession.user as any).orgEligibility = {
                ok: false,
                status: "configuration_error",
                checkedAt: 1,
                nextCheckAt: Number.MAX_SAFE_INTEGER,
            };

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

            const result = await authenticateAdminRequest();

            expect(result.success).toBe(true);
        });

        it("should use githubUsername for rate limiting (not display name)", async () => {
            const { getSmsRateLimitKey } = await import("@/app/utils/rate-limit");
            const mockGetSmsRateLimitKey = vi.mocked(getSmsRateLimitKey);

            const { authenticateAdminRequest } = await import("@/app/utils/auth/api-auth");

            const mockSession = createMockSessionWithDisplayName();
            mockAuth.mockResolvedValue(mockSession);

            await authenticateAdminRequest({
                endpoint: "sms",
                config: { maxRequests: 10, windowMs: 60_000 },
            });

            expect(mockGetSmsRateLimitKey).toHaveBeenCalledWith("sms", "johndoe123", undefined);
        });
    });
});
