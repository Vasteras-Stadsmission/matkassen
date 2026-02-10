/**
 * Integration tests for user agreement functionality.
 *
 * Tests the complete flow of:
 * - Creating and versioning agreements
 * - User acceptance tracking
 * - Checking if users have accepted the current agreement
 * - Agreement version management
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb, cleanupTestDb } from "../../db/test-db";
import {
    createTestUser,
    createTestAgreement,
    createTestAgreementEffectiveAt,
    createTestAgreementAcceptance,
    resetUserCounter,
    resetAgreementCounter,
} from "../../factories";
import { userAgreements, userAgreementAcceptances } from "@/app/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
    getCurrentAgreement,
    hasUserAcceptedCurrentAgreement,
    hasUserAcceptedAgreement,
    getUserAgreementStatus,
    getUserIdByGithubUsername,
    recordAgreementAcceptance,
    getNextAgreementVersion,
    createAgreement,
    getAgreementAcceptanceCount,
    MAX_AGREEMENT_CONTENT_LENGTH,
} from "@/app/utils/user-agreement";

describe("User Agreement - Integration Tests", () => {
    beforeEach(async () => {
        await cleanupTestDb();
        resetUserCounter();
        resetAgreementCounter();
    });

    describe("Agreement Creation & Versioning", () => {
        it("should create first agreement with version 1", async () => {
            const agreement = await createTestAgreement();

            expect(agreement.version).toBe(1);
            expect(agreement.content).toContain("Test Agreement");
            expect(agreement.effective_from).toBeInstanceOf(Date);
            expect(agreement.created_by).toBeDefined();
        });

        it("should auto-increment version when creating new agreements", async () => {
            const agreement1 = await createTestAgreement();
            const agreement2 = await createTestAgreement();
            const agreement3 = await createTestAgreement();

            expect(agreement1.version).toBe(1);
            expect(agreement2.version).toBe(2);
            expect(agreement3.version).toBe(3);
        });

        it("should preserve all agreement versions for audit trail", async () => {
            await createTestAgreement({ content: "Version 1 content" });
            await createTestAgreement({ content: "Version 2 content" });
            await createTestAgreement({ content: "Version 3 content" });

            const db = await getTestDb();
            const allAgreements = await db
                .select()
                .from(userAgreements)
                .orderBy(desc(userAgreements.version));

            expect(allAgreements.length).toBe(3);
            expect(allAgreements[0].content).toBe("Version 3 content");
            expect(allAgreements[1].content).toBe("Version 2 content");
            expect(allAgreements[2].content).toBe("Version 1 content");
        });

        it("should track created_by for each version", async () => {
            const agreement = await createTestAgreement({ created_by: "admin_user" });

            expect(agreement.created_by).toBe("admin_user");
        });
    });

    describe("Agreement Acceptance", () => {
        it("should record acceptance with timestamp", async () => {
            const user = await createTestUser();
            const agreement = await createTestAgreement();

            await createTestAgreementAcceptance(user.id, agreement.id);

            const db = await getTestDb();
            const [acceptance] = await db
                .select()
                .from(userAgreementAcceptances)
                .where(
                    and(
                        eq(userAgreementAcceptances.user_id, user.id),
                        eq(userAgreementAcceptances.agreement_id, agreement.id),
                    ),
                )
                .limit(1);

            expect(acceptance).toBeDefined();
            expect(acceptance.accepted_at).toBeInstanceOf(Date);
        });

        it("should handle duplicate acceptance gracefully (idempotent)", async () => {
            const user = await createTestUser();
            const agreement = await createTestAgreement();

            // Accept twice - should not throw
            await createTestAgreementAcceptance(user.id, agreement.id);
            await createTestAgreementAcceptance(user.id, agreement.id);

            const db = await getTestDb();
            const acceptances = await db
                .select()
                .from(userAgreementAcceptances)
                .where(eq(userAgreementAcceptances.user_id, user.id));

            // Should only have one record due to onConflictDoNothing
            expect(acceptances.length).toBe(1);
        });

        it("should allow acceptance of different agreement versions", async () => {
            const user = await createTestUser();
            const agreement1 = await createTestAgreement();
            const agreement2 = await createTestAgreement();

            await createTestAgreementAcceptance(user.id, agreement1.id);
            await createTestAgreementAcceptance(user.id, agreement2.id);

            const db = await getTestDb();
            const acceptances = await db
                .select()
                .from(userAgreementAcceptances)
                .where(eq(userAgreementAcceptances.user_id, user.id));

            expect(acceptances.length).toBe(2);
        });
    });

    describe("Current Agreement Logic", () => {
        it("should return most recent effective agreement as current", async () => {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

            await createTestAgreementEffectiveAt(twoDaysAgo, { content: "Older agreement" });
            await createTestAgreementEffectiveAt(yesterday, { content: "Newer agreement" });

            const current = await getCurrentAgreement();

            expect(current).toBeDefined();
            expect(current?.content).toBe("Newer agreement");
        });

        it("should not return future-dated agreements as current", async () => {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);

            await createTestAgreementEffectiveAt(yesterday, { content: "Current agreement" });
            await createTestAgreementEffectiveAt(tomorrow, { content: "Future agreement" });

            const current = await getCurrentAgreement();

            expect(current).toBeDefined();
            expect(current?.content).toBe("Current agreement");
        });

        it("should return null when no agreements exist", async () => {
            const current = await getCurrentAgreement();

            expect(current).toBeNull();
        });
    });

    describe("User Agreement Status", () => {
        it("should return hasAccepted=true when no agreement exists", async () => {
            const user = await createTestUser();

            const hasAccepted = await hasUserAcceptedCurrentAgreement(user.id);

            // No agreement = nothing to accept = allowed
            expect(hasAccepted).toBe(true);
        });

        it("should return hasAccepted=false for new user with existing agreement", async () => {
            await createTestAgreement();
            const user = await createTestUser();

            const hasAccepted = await hasUserAcceptedCurrentAgreement(user.id);

            expect(hasAccepted).toBe(false);
        });

        it("should return hasAccepted=true after acceptance", async () => {
            const agreement = await createTestAgreement();
            const user = await createTestUser();

            await recordAgreementAcceptance(user.id, agreement.id);

            const hasAccepted = await hasUserAcceptedCurrentAgreement(user.id);

            expect(hasAccepted).toBe(true);
        });

        it("should return hasAccepted=false when new version is published", async () => {
            const agreement1 = await createTestAgreement();
            const user = await createTestUser();

            // User accepts version 1
            await recordAgreementAcceptance(user.id, agreement1.id);

            let hasAccepted = await hasUserAcceptedCurrentAgreement(user.id);
            expect(hasAccepted).toBe(true);

            // New version is published
            await createTestAgreement();

            hasAccepted = await hasUserAcceptedCurrentAgreement(user.id);
            expect(hasAccepted).toBe(false);
        });

        it("should return full status with getUserAgreementStatus", async () => {
            const agreement = await createTestAgreement();
            const user = await createTestUser();

            // Before acceptance
            let status = await getUserAgreementStatus(user.id);
            expect(status.currentAgreement).toBeDefined();
            expect(status.hasAccepted).toBe(false);
            expect(status.acceptedAt).toBeNull();

            // After acceptance
            await recordAgreementAcceptance(user.id, agreement.id);

            status = await getUserAgreementStatus(user.id);
            expect(status.hasAccepted).toBe(true);
            expect(status.acceptedAt).toBeInstanceOf(Date);
        });
    });

    describe("Utility Functions", () => {
        it("getNextAgreementVersion should return 1 for empty table", async () => {
            const nextVersion = await getNextAgreementVersion();
            expect(nextVersion).toBe(1);
        });

        it("getNextAgreementVersion should increment from latest", async () => {
            await createTestAgreement();
            await createTestAgreement();

            const nextVersion = await getNextAgreementVersion();
            expect(nextVersion).toBe(3);
        });

        it("createAgreement should create with correct version", async () => {
            await createTestAgreement(); // version 1

            const newAgreement = await createAgreement("New content", "admin");

            expect(newAgreement.version).toBe(2);
            expect(newAgreement.content).toBe("New content");
            expect(newAgreement.createdBy).toBe("admin");
        });

        it("getAgreementAcceptanceCount should return correct count", async () => {
            const agreement = await createTestAgreement();
            const user1 = await createTestUser();
            const user2 = await createTestUser();
            const user3 = await createTestUser();

            // Initial count
            let count = await getAgreementAcceptanceCount(agreement.id);
            expect(count).toBe(0);

            // After acceptances
            await recordAgreementAcceptance(user1.id, agreement.id);
            await recordAgreementAcceptance(user2.id, agreement.id);

            count = await getAgreementAcceptanceCount(agreement.id);
            expect(count).toBe(2);

            // user3 doesn't accept, count stays at 2
            expect(count).toBe(2);
        });
    });

    describe("Database Constraints", () => {
        it("should cascade delete acceptances when user is deleted", async () => {
            const db = await getTestDb();
            const agreement = await createTestAgreement();
            const user = await createTestUser();

            await recordAgreementAcceptance(user.id, agreement.id);

            // Verify acceptance exists
            let acceptances = await db
                .select()
                .from(userAgreementAcceptances)
                .where(eq(userAgreementAcceptances.user_id, user.id));
            expect(acceptances.length).toBe(1);

            // Delete user
            const { users } = await import("@/app/db/schema");
            await db.delete(users).where(eq(users.id, user.id));

            // Acceptance should be cascade deleted
            acceptances = await db
                .select()
                .from(userAgreementAcceptances)
                .where(eq(userAgreementAcceptances.user_id, user.id));
            expect(acceptances.length).toBe(0);
        });

        it("should prevent agreement deletion when acceptances exist (RESTRICT)", async () => {
            const db = await getTestDb();
            const agreement = await createTestAgreement();
            const user = await createTestUser();

            await recordAgreementAcceptance(user.id, agreement.id);

            // Try to delete agreement - should fail due to RESTRICT
            await expect(
                db.delete(userAgreements).where(eq(userAgreements.id, agreement.id)),
            ).rejects.toThrow();
        });

        it("should enforce composite primary key uniqueness", async () => {
            const db = await getTestDb();
            const agreement = await createTestAgreement();
            const user = await createTestUser();

            // First insert should succeed
            await db.insert(userAgreementAcceptances).values({
                user_id: user.id,
                agreement_id: agreement.id,
            });

            // Second insert with same keys should fail
            await expect(
                db.insert(userAgreementAcceptances).values({
                    user_id: user.id,
                    agreement_id: agreement.id,
                }),
            ).rejects.toThrow();
        });

        it("should enforce unique constraint on agreement version", async () => {
            const db = await getTestDb();
            await createTestAgreement({ version: 1 });

            // Inserting another agreement with the same version should fail
            await expect(
                db.insert(userAgreements).values({
                    content: "Duplicate version",
                    version: 1,
                    effective_from: new Date(),
                    created_by: "admin",
                }),
            ).rejects.toThrow();
        });
    });

    describe("getUserIdByGithubUsername", () => {
        it("should return user ID for existing user", async () => {
            const user = await createTestUser({ github_username: "testuser123" });

            const userId = await getUserIdByGithubUsername("testuser123");

            expect(userId).toBe(user.id);
        });

        it("should return null for non-existent username", async () => {
            const userId = await getUserIdByGithubUsername("nonexistent_user");

            expect(userId).toBeNull();
        });
    });

    describe("hasUserAcceptedAgreement", () => {
        it("should return true when user has accepted the specific agreement", async () => {
            const agreement = await createTestAgreement();
            const user = await createTestUser();

            await recordAgreementAcceptance(user.id, agreement.id);

            const accepted = await hasUserAcceptedAgreement(user.id, agreement.id);
            expect(accepted).toBe(true);
        });

        it("should return false when user has not accepted the specific agreement", async () => {
            const agreement = await createTestAgreement();
            const user = await createTestUser();

            const accepted = await hasUserAcceptedAgreement(user.id, agreement.id);
            expect(accepted).toBe(false);
        });

        it("should distinguish between different agreement versions", async () => {
            const agreement1 = await createTestAgreement();
            const agreement2 = await createTestAgreement();
            const user = await createTestUser();

            // Accept only agreement1
            await recordAgreementAcceptance(user.id, agreement1.id);

            expect(await hasUserAcceptedAgreement(user.id, agreement1.id)).toBe(true);
            expect(await hasUserAcceptedAgreement(user.id, agreement2.id)).toBe(false);
        });
    });

    describe("Stale agreement acceptance guard", () => {
        it("should reject acceptance of an outdated agreement version", async () => {
            const agreement1 = await createTestAgreement();
            const user = await createTestUser();

            // User accepts v1 — should succeed
            await recordAgreementAcceptance(user.id, agreement1.id);
            expect(await hasUserAcceptedCurrentAgreement(user.id)).toBe(true);

            // New version published — v2 is now current
            const agreement2 = await createTestAgreement();
            expect(await hasUserAcceptedCurrentAgreement(user.id)).toBe(false);

            // Verify that the current agreement is v2
            const current = await getCurrentAgreement();
            expect(current?.id).toBe(agreement2.id);

            // Accepting v1 again doesn't satisfy the current requirement
            await recordAgreementAcceptance(user.id, agreement1.id);
            expect(await hasUserAcceptedCurrentAgreement(user.id)).toBe(false);

            // Must accept v2 specifically
            await recordAgreementAcceptance(user.id, agreement2.id);
            expect(await hasUserAcceptedCurrentAgreement(user.id)).toBe(true);
        });
    });

    describe("Content length validation", () => {
        it("should export MAX_AGREEMENT_CONTENT_LENGTH constant", () => {
            expect(MAX_AGREEMENT_CONTENT_LENGTH).toBe(100_000);
        });
    });

    describe("createAgreement with transaction safety", () => {
        it("should create agreement with correct version in transaction", async () => {
            const a1 = await createAgreement("First", "admin");
            const a2 = await createAgreement("Second", "admin");
            const a3 = await createAgreement("Third", "admin");

            expect(a1.version).toBe(1);
            expect(a2.version).toBe(2);
            expect(a3.version).toBe(3);
        });

        it("should create agreement with custom effectiveFrom date", async () => {
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
            const current = await createAgreement("Current", "admin");
            await createAgreement("Future", "admin", tomorrow);

            // Future agreement should not be returned as current
            const currentAgreement = await getCurrentAgreement();
            expect(currentAgreement?.id).toBe(current.id);
        });
    });

    describe("recordAgreementAcceptance with invalid IDs", () => {
        it("should throw when recording acceptance for non-existent user", async () => {
            const agreement = await createTestAgreement();
            await expect(
                recordAgreementAcceptance("non-existent-user-id", agreement.id),
            ).rejects.toThrow();
        });

        it("should throw when recording acceptance for non-existent agreement", async () => {
            const user = await createTestUser();
            await expect(
                recordAgreementAcceptance(user.id, "non-existent-agreement-id"),
            ).rejects.toThrow();
        });
    });
});
