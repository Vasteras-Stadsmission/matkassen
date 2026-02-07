/**
 * Tests for server action authentication
 * Verifies that verifyServerActionAuth uses githubUsername instead of display name
 * REGRESSION TEST: Prevents bug where users with display names couldn't authenticate
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSession, createMockSessionWithDisplayName } from "../../../test-helpers";

// Mock the auth module
const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
    auth: () => mockAuth(),
}));

describe("Server Action Authentication", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("verifyServerActionAuth", () => {
        it("should allow users with display names when eligible", async () => {
            // Import after mocks are set up
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            // User with display name different from login
            const mockSession = createMockSessionWithDisplayName();
            mockAuth.mockResolvedValue(mockSession);

            const result = await verifyServerActionAuth();

            expect(result.success).toBe(true);
        });

        it("REGRESSION: user with display name should authenticate successfully", async () => {
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            // This is the bug scenario: display name = "John Doe", login = "johndoe123"
            const mockSession = createMockSession({
                githubUsername: "johndoe123",
                name: "John Doe",
                email: "john@example.com",
            });

            mockAuth.mockResolvedValue(mockSession);

            const result = await verifyServerActionAuth();

            // Should succeed
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual(mockSession);
            }
        });

        it("should fail when githubUsername is missing", async () => {
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            // Session without githubUsername
            const mockSession = {
                user: {
                    name: "John Doe",
                    email: "john@example.com",
                    // githubUsername missing
                },
            };

            mockAuth.mockResolvedValue(mockSession);

            const result = await verifyServerActionAuth();

            expect(result.success).toBe(false);
            expect((result as any).error.code).toBe("UNAUTHORIZED");
        });

        it("should fail when organization eligibility is missing", async () => {
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            const mockSession = createMockSession();
            (mockSession.user as any).orgEligibility = undefined;
            mockAuth.mockResolvedValue(mockSession);

            const result = await verifyServerActionAuth();

            expect(result.success).toBe(false);
            expect((result as any).error.code).toBe("FORBIDDEN");
        });

        it("should fail when organization eligibility is not ok", async () => {
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            const mockSession = createMockSession();
            (mockSession.user as any).orgEligibility = {
                ok: false,
                status: "not_member",
                checkedAt: 1,
                nextCheckAt: Number.MAX_SAFE_INTEGER,
            };
            mockAuth.mockResolvedValue(mockSession);

            const result = await verifyServerActionAuth();

            expect(result.success).toBe(false);
            expect((result as any).error.code).toBe("FORBIDDEN");
        });

        it("should return configuration error when eligibility has config issue", async () => {
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            const mockSession = createMockSession();
            mockAuth.mockResolvedValue(mockSession);
            (mockSession.user as any).orgEligibility = {
                ok: false,
                status: "configuration_error",
                checkedAt: 1,
                nextCheckAt: Number.MAX_SAFE_INTEGER,
            };

            const result = await verifyServerActionAuth();

            expect(result.success).toBe(false);
            expect((result as any).error.code).toBe("CONFIGURATION_ERROR");
        });

        it("should work with users who have no display name set", async () => {
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            const mockSession = createMockSession({
                githubUsername: "johndoe123",
                name: null, // No display name
                email: "john@example.com",
            });

            mockAuth.mockResolvedValue(mockSession);

            const result = await verifyServerActionAuth();

            expect(result.success).toBe(true);
        });

        it("should handle special characters in display name correctly", async () => {
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            const mockSession = createMockSession({
                githubUsername: "user123",
                name: "Jöhn Döe-Smith", // Special characters
                email: "john@example.com",
            });

            mockAuth.mockResolvedValue(mockSession);

            const result = await verifyServerActionAuth();

            expect(result.success).toBe(true);
        });

        it("should handle display name equal to username", async () => {
            const { verifyServerActionAuth } = await import("@/app/utils/auth/server-action-auth");

            const mockSession = createMockSession({
                githubUsername: "johndoe",
                name: "johndoe", // Same as username
                email: "john@example.com",
            });

            mockAuth.mockResolvedValue(mockSession);

            const result = await verifyServerActionAuth();

            expect(result.success).toBe(true);
        });
    });
});
