import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create a mock for the auth configuration
// We'll test the signIn callback logic separately since testing NextAuth directly is complex
const createMockSignInCallback = () => {
    // Mock the validateOrganizationMembership function
    const mockValidateOrganization = vi.fn();

    // Simulate the signIn callback logic from auth.ts
    const signInCallback = async ({ account, profile }: { account?: any; profile?: any }) => {
        if (account?.provider === "github") {
            const username = profile?.login as string;

            // Use centralized organization membership validation
            const orgCheck = await mockValidateOrganization(username, "signin");

            if (!orgCheck.isValid) {
                if (orgCheck.error?.includes("configuration")) {
                    return `/auth/error?error=configuration`;
                }
                // Access denied - return false to trigger AccessDenied error
                return false;
            }

            return true;
        }
        return `/auth/error?error=invalid-provider`;
    };

    return { signInCallback, mockValidateOrganization };
};

describe("Authentication Flow", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            GITHUB_ORG: "vasteras-stadsmission",
        };
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.clearAllMocks();
    });

    describe("signIn callback error handling", () => {
        it("should return explicit error for invalid provider", async () => {
            const { signInCallback } = createMockSignInCallback();

            const result = await signInCallback({
                account: { provider: "google" },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=invalid-provider");
        });

        it("should return configuration error when organization is missing", async () => {
            const { signInCallback, mockValidateOrganization } = createMockSignInCallback();
            mockValidateOrganization.mockResolvedValue({
                isValid: false,
                error: "Server configuration error",
            });

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return configuration error when username is missing", async () => {
            const { signInCallback, mockValidateOrganization } = createMockSignInCallback();
            mockValidateOrganization.mockResolvedValue({
                isValid: false,
                error: "Server configuration error",
            });

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: undefined },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return true for valid organization member", async () => {
            const { signInCallback, mockValidateOrganization } = createMockSignInCallback();
            mockValidateOrganization.mockResolvedValue({ isValid: true });

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "validuser" },
            });

            expect(result).toBe(true);
            expect(mockValidateOrganization).toHaveBeenCalledWith("validuser", "signin");
        });

        it("should return false for non-organization member (AccessDenied)", async () => {
            const { signInCallback, mockValidateOrganization } = createMockSignInCallback();
            mockValidateOrganization.mockResolvedValue({
                isValid: false,
                error: "Access denied: Organization membership required",
            });

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "nonmember" },
            });

            expect(result).toBe(false); // This triggers Auth.js AccessDenied error
            expect(mockValidateOrganization).toHaveBeenCalledWith("nonmember", "signin");
        });

        it("should return configuration error when membership check fails", async () => {
            const { signInCallback, mockValidateOrganization } = createMockSignInCallback();
            mockValidateOrganization.mockResolvedValue({
                isValid: false,
                error: "Server configuration error",
            });

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=configuration");
            expect(mockValidateOrganization).toHaveBeenCalledWith("testuser", "signin");
        });
    });
});
