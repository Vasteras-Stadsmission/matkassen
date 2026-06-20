/**
 * Tests for agreement-aware protected action wrappers.
 *
 * Verifies that protectedAgreementAction and protectedAgreementHouseholdAction
 * correctly check agreement acceptance before allowing actions to proceed.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSession } from "../../../test-helpers";

// Mock dependencies
const mockAuth = vi.fn();
vi.mock("@/auth", () => ({
    auth: () => mockAuth(),
}));

const mockGetCurrentAgreement = vi.fn();
const mockGetUserIdByGithubUsername = vi.fn();
const mockHasUserAcceptedAgreement = vi.fn();

vi.mock("@/app/utils/user-agreement", () => ({
    getCurrentAgreement: () => mockGetCurrentAgreement(),
    getUserIdByGithubUsername: (username: string) => mockGetUserIdByGithubUsername(username),
    hasUserAcceptedAgreement: (userId: string, agreementId: string) =>
        mockHasUserAcceptedAgreement(userId, agreementId),
}));

vi.mock("@/app/utils/logger", () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock("@/app/db/drizzle", () => ({
    db: {},
}));

vi.mock("@/app/db/schema", () => ({
    households: {},
}));

describe("Protected Agreement Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.resetModules();
    });

    describe("protectedAgreementAction", () => {
        it("should pass through when no agreement exists", async () => {
            const { protectedAgreementAction } = await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue(null);

            const innerAction = vi.fn().mockResolvedValue({ success: true, data: "ok" });
            const action = protectedAgreementAction(innerAction);

            const result = await action();
            expect(result.success).toBe(true);
            expect(innerAction).toHaveBeenCalled();
        });

        it("should block when user has no githubUsername (auth layer rejects first)", async () => {
            const { protectedAgreementAction } = await import("@/app/utils/auth/protected-action");

            const session = createMockSession({ githubUsername: undefined as unknown as string });
            session.user!.githubUsername = undefined as unknown as string;
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });

            const innerAction = vi.fn();
            const action = protectedAgreementAction(innerAction);

            const result = await action();
            // Auth layer rejects before agreement check — missing githubUsername = unauthorized
            expect(result.success).toBe(false);
            expect(innerAction).not.toHaveBeenCalled();
        });

        it("should block when user not found in DB", async () => {
            const { protectedAgreementAction } = await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });
            mockGetUserIdByGithubUsername.mockResolvedValue(null);

            const innerAction = vi.fn();
            const action = protectedAgreementAction(innerAction);

            const result = await action();
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("AGREEMENT_REQUIRED");
            }
            expect(innerAction).not.toHaveBeenCalled();
        });

        it("should block when user has not accepted agreement", async () => {
            const { protectedAgreementAction } = await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });
            mockGetUserIdByGithubUsername.mockResolvedValue("user-123");
            mockHasUserAcceptedAgreement.mockResolvedValue(false);

            const innerAction = vi.fn();
            const action = protectedAgreementAction(innerAction);

            const result = await action();
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("AGREEMENT_REQUIRED");
            }
            expect(innerAction).not.toHaveBeenCalled();
        });

        it("should allow when user has accepted agreement", async () => {
            const { protectedAgreementAction } = await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });
            mockGetUserIdByGithubUsername.mockResolvedValue("user-123");
            mockHasUserAcceptedAgreement.mockResolvedValue(true);

            const innerAction = vi.fn().mockResolvedValue({ success: true, data: "ok" });
            const action = protectedAgreementAction(innerAction);

            const result = await action();
            expect(result.success).toBe(true);
            expect(innerAction).toHaveBeenCalled();
        });

        it("should handle errors in agreement check gracefully", async () => {
            const { protectedAgreementAction } = await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockRejectedValue(new Error("DB connection failed"));

            const innerAction = vi.fn();
            const action = protectedAgreementAction(innerAction);

            const result = await action();
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("AGREEMENT_CHECK_FAILED");
            }
            expect(innerAction).not.toHaveBeenCalled();
        });
    });

    describe("protectedAgreementReadAction", () => {
        it("should throw when unauthenticated", async () => {
            const { protectedAgreementReadAction } =
                await import("@/app/utils/auth/protected-action");

            mockAuth.mockResolvedValue(null);

            const innerAction = vi.fn();
            const action = protectedAgreementReadAction(innerAction);

            await expect(action()).rejects.toThrow("authenticated");
            expect(innerAction).not.toHaveBeenCalled();
        });

        it("should throw when user has not accepted agreement", async () => {
            const { protectedAgreementReadAction } =
                await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });
            mockGetUserIdByGithubUsername.mockResolvedValue("user-123");
            mockHasUserAcceptedAgreement.mockResolvedValue(false);

            const innerAction = vi.fn();
            const action = protectedAgreementReadAction(innerAction);

            await expect(action()).rejects.toThrow(
                "You must accept the current agreement before performing this action",
            );
            expect(innerAction).not.toHaveBeenCalled();
        });

        it("should allow when user has accepted agreement", async () => {
            const { protectedAgreementReadAction } =
                await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });
            mockGetUserIdByGithubUsername.mockResolvedValue("user-123");
            mockHasUserAcceptedAgreement.mockResolvedValue(true);

            const innerAction = vi.fn().mockResolvedValue("ok");
            const action = protectedAgreementReadAction(innerAction);

            await expect(action()).resolves.toBe("ok");
            expect(innerAction).toHaveBeenCalledWith(session);
        });
    });

    describe("protectedAdminAgreementReadAction", () => {
        it("should throw when authenticated user is not an admin", async () => {
            const { protectedAdminAgreementReadAction } =
                await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            session.user!.role = "handout_staff";
            mockAuth.mockResolvedValue(session);

            const innerAction = vi.fn();
            const action = protectedAdminAgreementReadAction(innerAction);

            await expect(action()).rejects.toThrow("Admin access required");
            expect(mockGetCurrentAgreement).not.toHaveBeenCalled();
            expect(innerAction).not.toHaveBeenCalled();
        });

        it("should throw when admin has not accepted agreement", async () => {
            const { protectedAdminAgreementReadAction } =
                await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });
            mockGetUserIdByGithubUsername.mockResolvedValue("user-123");
            mockHasUserAcceptedAgreement.mockResolvedValue(false);

            const innerAction = vi.fn();
            const action = protectedAdminAgreementReadAction(innerAction);

            await expect(action()).rejects.toThrow(
                "You must accept the current agreement before performing this action",
            );
            expect(innerAction).not.toHaveBeenCalled();
        });

        it("should allow when admin has accepted agreement", async () => {
            const { protectedAdminAgreementReadAction } =
                await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });
            mockGetUserIdByGithubUsername.mockResolvedValue("user-123");
            mockHasUserAcceptedAgreement.mockResolvedValue(true);

            const innerAction = vi.fn().mockResolvedValue("ok");
            const action = protectedAdminAgreementReadAction(innerAction);

            await expect(action()).resolves.toBe("ok");
            expect(innerAction).toHaveBeenCalledWith(session);
        });
    });

    describe("protectedAgreementHouseholdAction", () => {
        it("should block when agreement not accepted, before household check", async () => {
            const { protectedAgreementHouseholdAction } =
                await import("@/app/utils/auth/protected-action");

            const session = createMockSession();
            mockAuth.mockResolvedValue(session);
            mockGetCurrentAgreement.mockResolvedValue({ id: "agr-1", version: 1 });
            mockGetUserIdByGithubUsername.mockResolvedValue("user-123");
            mockHasUserAcceptedAgreement.mockResolvedValue(false);

            const innerAction = vi.fn();
            const action = protectedAgreementHouseholdAction(innerAction);

            // The household check should never be reached
            const result = await action("household-1");
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.code).toBe("AGREEMENT_REQUIRED");
            }
            expect(innerAction).not.toHaveBeenCalled();
        });
    });
});
