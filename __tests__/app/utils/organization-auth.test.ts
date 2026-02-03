import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    clearOrganizationMembershipCache,
    validateOrganizationMembership,
} from "../../../app/utils/auth/organization-auth";

// Mock the github-app module
vi.mock("../../../app/utils/github-app", () => ({
    checkOrganizationMembership: vi.fn(),
}));

import { checkOrganizationMembership } from "../../../app/utils/github-app";

const mockCheckOrganizationMembership = vi.mocked(checkOrganizationMembership);

describe("validateOrganizationMembership", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        process.env = {
            ...originalEnv,
            GITHUB_ORG: "test-org",
        };
        vi.clearAllMocks();
        clearOrganizationMembershipCache();
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    it("should return success when user is organization member", async () => {
        mockCheckOrganizationMembership.mockResolvedValue(true);

        const result = await validateOrganizationMembership("testuser", "test");

        expect(result).toEqual({ isValid: true });
        expect(mockCheckOrganizationMembership).toHaveBeenCalledWith("testuser", "test-org");
    });

    it("should return failure when user is not organization member", async () => {
        mockCheckOrganizationMembership.mockResolvedValue(false);

        const result = await validateOrganizationMembership("testuser", "test");

        expect(result).toEqual({
            isValid: false,
            error: "Access denied: Organization membership required",
            details: "User is not a member of test-org",
        });
    });

    it("should return configuration error when GITHUB_ORG is missing", async () => {
        delete process.env.GITHUB_ORG;

        const result = await validateOrganizationMembership("testuser", "test");

        expect(result).toEqual({
            isValid: false,
            error: "Server configuration error",
            details: "Missing organization configuration",
        });
        expect(mockCheckOrganizationMembership).not.toHaveBeenCalled();
    });

    it("should return error when username is empty", async () => {
        const result = await validateOrganizationMembership("", "test");

        expect(result).toEqual({
            isValid: false,
            error: "Invalid user data",
            details: "Username is required",
        });
        expect(mockCheckOrganizationMembership).not.toHaveBeenCalled();
    });

    it("should handle GitHub API errors gracefully", async () => {
        mockCheckOrganizationMembership.mockRejectedValue(new Error("API error"));

        const result = await validateOrganizationMembership("testuser", "test");

        expect(result).toEqual({
            isValid: false,
            error: "Unable to verify organization membership",
            details: "Membership verification failed",
        });
    });

    it("should use default context when none provided", async () => {
        mockCheckOrganizationMembership.mockResolvedValue(true);

        const result = await validateOrganizationMembership("testuser");

        expect(result).toEqual({ isValid: true });
        // Should still work with default context
    });

    it("should work with different contexts", async () => {
        mockCheckOrganizationMembership.mockResolvedValue(true);

        const result = await validateOrganizationMembership("testuser", "api");

        // Test focuses on behavior, not logging implementation
        expect(result).toEqual({ isValid: true });
        expect(mockCheckOrganizationMembership).toHaveBeenCalledWith("testuser", "test-org");
    });
});
