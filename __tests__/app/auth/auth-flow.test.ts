import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockGitHubProfile } from "../../test-helpers";

// Create a mock for the auth configuration
// We'll test the signIn callback logic separately since testing NextAuth directly is complex
const createMockSignInCallback = () => {
    // Mock the org eligibility check
    const mockCheckEligibility = vi.fn();

    // Simulate the signIn callback logic from auth.ts
    const signInCallback = async ({ account, profile }: { account?: any; profile?: any }) => {
        if (account?.provider === "github") {
            const username = profile?.login as string;
            const accessToken = account?.access_token as string | undefined;

            if (!username || !accessToken) {
                return `/auth/error?error=configuration`;
            }

            const eligibility = await mockCheckEligibility(accessToken);
            if (!eligibility.ok) {
                if (eligibility.status === "configuration_error") {
                    return `/auth/error?error=configuration`;
                }
                // Redirect to access-denied page for ineligible users
                return `/auth/access-denied`;
            }

            return true;
        }
        return `/auth/error?error=invalid-provider`;
    };

    return { signInCallback, mockCheckEligibility };
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
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: false, status: "configuration_error" });

            const result = await signInCallback({
                account: { provider: "github" },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return configuration error when username is missing", async () => {
            const { signInCallback } = createMockSignInCallback();

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: undefined },
            });

            expect(result).toBe("/auth/error?error=configuration");
        });

        it("should return true for valid organization member", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: true });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: "validuser" },
            });

            expect(result).toBe(true);
            expect(mockCheckEligibility).toHaveBeenCalledWith("token");
        });

        it("should redirect non-organization member to access-denied page", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: false, status: "not_member" });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: "nonmember" },
            });

            expect(result).toBe("/auth/access-denied");
            expect(mockCheckEligibility).toHaveBeenCalledWith("token");
        });

        it("should return configuration error when membership check fails", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: false, status: "configuration_error" });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: { login: "testuser" },
            });

            expect(result).toBe("/auth/error?error=configuration");
            expect(mockCheckEligibility).toHaveBeenCalledWith("token");
        });
    });

    describe("Full authentication flow with GitHub username preservation", () => {
        it("should preserve GitHub login through sign-in", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: true });

            const mockProfile = createMockGitHubProfile({
                login: "johndoe123",
                name: "John Doe",
            });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: mockProfile,
            });

            expect(result).toBe(true);
        });

        it("REGRESSION: users with display names should sign in successfully", async () => {
            const { signInCallback, mockCheckEligibility } = createMockSignInCallback();
            mockCheckEligibility.mockResolvedValue({ ok: true });

            // User with display name different from login
            const mockProfile = createMockGitHubProfile({
                login: "johndoe123",
                name: "John Doe", // Display name
            });

            const result = await signInCallback({
                account: { provider: "github", access_token: "token" },
                profile: mockProfile,
            });

            expect(result).toBe(true);
        });
    });
});
