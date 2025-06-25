import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkOrganizationMembership, getGitHubAppToken } from "../../../app/utils/github-app";

// Mock the fetch function globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock the @octokit/auth-app module
vi.mock("@octokit/auth-app", () => ({
    createAppAuth: vi.fn(() => vi.fn(() => ({ token: "mock-installation-token" }))),
}));

describe("github-app utilities", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.clearAllMocks();
        // Reset environment variables
        process.env = {
            ...originalEnv,
            AUTH_GITHUB_APP_ID: "123456",
            AUTH_GITHUB_APP_PRIVATE_KEY:
                "-----BEGIN RSA PRIVATE KEY-----\ntest-key\n-----END RSA PRIVATE KEY-----",
            AUTH_GITHUB_APP_INSTALLATION_ID: "72805193",
        };
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe("getGitHubAppToken", () => {
        it("should throw error when AUTH_GITHUB_APP_ID is missing", async () => {
            delete process.env.AUTH_GITHUB_APP_ID;

            await expect(getGitHubAppToken()).rejects.toThrow(
                "Missing required GitHub App environment variable(s): AUTH_GITHUB_APP_ID",
            );
        });

        it("should throw error when AUTH_GITHUB_APP_PRIVATE_KEY is missing", async () => {
            delete process.env.AUTH_GITHUB_APP_PRIVATE_KEY;

            await expect(getGitHubAppToken()).rejects.toThrow(
                "Missing required GitHub App environment variable(s): AUTH_GITHUB_APP_PRIVATE_KEY",
            );
        });

        it("should throw error when AUTH_GITHUB_APP_INSTALLATION_ID is missing", async () => {
            delete process.env.AUTH_GITHUB_APP_INSTALLATION_ID;

            await expect(getGitHubAppToken()).rejects.toThrow(
                "Missing required GitHub App environment variable(s): AUTH_GITHUB_APP_INSTALLATION_ID",
            );
        });

        it("should throw error when multiple environment variables are missing", async () => {
            delete process.env.AUTH_GITHUB_APP_ID;
            delete process.env.AUTH_GITHUB_APP_INSTALLATION_ID;

            await expect(getGitHubAppToken()).rejects.toThrow(
                "Missing required GitHub App environment variable(s): AUTH_GITHUB_APP_ID, AUTH_GITHUB_APP_INSTALLATION_ID",
            );
        });

        it("should return token when all environment variables are present", async () => {
            const token = await getGitHubAppToken();
            expect(token).toBe("mock-installation-token");
        });
    });

    describe("checkOrganizationMembership", () => {
        beforeEach(() => {
            // Mock successful token generation for membership tests
            vi.mocked(mockFetch).mockClear();
        });

        it("should return true when user is a member (status 204)", async () => {
            mockFetch.mockResolvedValueOnce({
                status: 204,
            });

            const result = await checkOrganizationMembership("testuser", "testorg");
            expect(result).toBe(true);
            expect(mockFetch).toHaveBeenCalledWith(
                "https://api.github.com/orgs/testorg/members/testuser",
                {
                    headers: {
                        "Accept": "application/vnd.github+json",
                        "Authorization": "Bearer mock-installation-token",
                        "X-GitHub-Api-Version": "2022-11-28",
                    },
                },
            );
        });

        it("should return false when user is not a member (status 404)", async () => {
            mockFetch.mockResolvedValueOnce({
                status: 404,
            });

            const result = await checkOrganizationMembership("testuser", "testorg");
            expect(result).toBe(false);
        });

        it("should throw specific error for authentication failure (status 401)", async () => {
            mockFetch.mockResolvedValueOnce({
                status: 401,
            });

            await expect(checkOrganizationMembership("testuser", "testorg")).rejects.toThrow(
                "GitHub App authentication failed - check app credentials",
            );
        });

        it("should throw specific error for permission issues (status 403)", async () => {
            mockFetch.mockResolvedValueOnce({
                status: 403,
            });

            await expect(checkOrganizationMembership("testuser", "testorg")).rejects.toThrow(
                "GitHub App lacks permission to check organization membership",
            );
        });

        it("should throw specific error for rate limiting (status 429)", async () => {
            mockFetch.mockResolvedValueOnce({
                status: 429,
            });

            await expect(checkOrganizationMembership("testuser", "testorg")).rejects.toThrow(
                "GitHub API rate limit exceeded - please try again later",
            );
        });

        it("should throw error for unexpected status codes", async () => {
            mockFetch.mockResolvedValueOnce({
                status: 500,
            });

            await expect(checkOrganizationMembership("testuser", "testorg")).rejects.toThrow(
                "GitHub API returned unexpected status: 500",
            );
        });

        it("should handle network errors gracefully", async () => {
            mockFetch.mockRejectedValueOnce(new Error("Network error"));

            await expect(checkOrganizationMembership("testuser", "testorg")).rejects.toThrow(
                "Unable to verify organization membership - please try again",
            );
        });

        it("should re-throw GitHub-specific errors without modification", async () => {
            mockFetch.mockRejectedValueOnce(new Error("GitHub API is down"));

            await expect(checkOrganizationMembership("testuser", "testorg")).rejects.toThrow(
                "GitHub API is down",
            );
        });
    });
});
