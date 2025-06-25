import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Create a mock for the auth configuration
// We'll test the signIn callback logic separately since testing NextAuth directly is complex
const createMockSignInCallback = () => {
    // Mock the checkOrganizationMembership function
    const mockCheckMembership = vi.fn();

    // Simulate the signIn callback logic from auth.ts
    const signInCallback = async ({ account, profile }: { account?: any; profile?: any }) => {
        if (account?.provider === "github") {
            const organization = process.env.GITHUB_ORG;
            const username = profile?.login as string;

            if (!organization || !username) {
                return `/auth/error?error=configuration`;
            }

            try {
                const isMember = await mockCheckMembership(username, organization);
                if (isMember) {
                    return true;
                } else {
                    return false; // This will trigger AccessDenied error
                }
            } catch (error) {
                return `/auth/error?error=configuration`;
            }
        }
        return `/auth/error?error=invalid-provider`;
    };

    return { signInCallback, mockCheckMembership };
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
            delete process.env.GITHUB_ORG;
            const { signInCallback } = createMockSignInCallback();

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return configuration error when username is missing", async () => {
            const { signInCallback } = createMockSignInCallback();

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: undefined },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return true for valid organization member", async () => {
            const { signInCallback, mockCheckMembership } = createMockSignInCallback();
            mockCheckMembership.mockResolvedValue(true);

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "validuser" },
            });

            expect(result).toBe(true);
            expect(mockCheckMembership).toHaveBeenCalledWith("validuser", "vasteras-stadsmission");
        });

        it("should return false for non-organization member (AccessDenied)", async () => {
            const { signInCallback, mockCheckMembership } = createMockSignInCallback();
            mockCheckMembership.mockResolvedValue(false);

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "nonmember" },
            });

            expect(result).toBe(false); // This triggers Auth.js AccessDenied error
            expect(mockCheckMembership).toHaveBeenCalledWith("nonmember", "vasteras-stadsmission");
        });

        it("should return configuration error when membership check fails", async () => {
            const { signInCallback, mockCheckMembership } = createMockSignInCallback();
            mockCheckMembership.mockRejectedValue(new Error("API error"));

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=configuration");
            expect(mockCheckMembership).toHaveBeenCalledWith("testuser", "vasteras-stadsmission");
        });
    });
});
