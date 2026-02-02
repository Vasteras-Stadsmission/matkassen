/**
 * Scenario-based integration tests for user agreement (PuB) system.
 *
 * These tests describe real user journeys and business use cases rather than
 * testing individual functions in isolation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { cleanupTestDb } from "../../db/test-db";
import {
    createTestUser,
    createTestAgreement,
    resetUserCounter,
    resetAgreementCounter,
} from "../../factories";
import {
    getCurrentAgreement,
    hasUserAcceptedCurrentAgreement,
    getUserAgreementStatus,
    recordAgreementAcceptance,
    createAgreement,
    getAgreementAcceptanceCount,
} from "@/app/utils/user-agreement";

describe("User Agreement - Real World Scenarios", () => {
    beforeEach(async () => {
        await cleanupTestDb();
        resetUserCounter();
        resetAgreementCounter();
    });

    describe("Scenario: Organization onboarding - Setting up GDPR compliance", () => {
        it("should allow access when organization has not yet created an agreement", async () => {
            // Given: An organization just started using the system without any agreement
            const user = await createTestUser();

            // When: We check if the user can access protected content
            const hasAccepted = await hasUserAcceptedCurrentAgreement(user.id);

            // Then: Access should be granted (no agreement = nothing to accept)
            expect(hasAccepted).toBe(true);
        });

        it("should require all existing users to accept when first agreement is published", async () => {
            // Given: Three users already exist in the system
            const alice = await createTestUser({ githubUsername: "alice" });
            const bob = await createTestUser({ githubUsername: "bob" });
            const charlie = await createTestUser({ githubUsername: "charlie" });

            // All have access before agreement exists
            expect(await hasUserAcceptedCurrentAgreement(alice.id)).toBe(true);
            expect(await hasUserAcceptedCurrentAgreement(bob.id)).toBe(true);
            expect(await hasUserAcceptedCurrentAgreement(charlie.id)).toBe(true);

            // When: Admin publishes the organization's first agreement
            await createAgreement(
                "# Data Processing Agreement\n\nYou must handle personal data responsibly...",
                "admin",
            );

            // Then: All users must now accept before accessing protected content
            expect(await hasUserAcceptedCurrentAgreement(alice.id)).toBe(false);
            expect(await hasUserAcceptedCurrentAgreement(bob.id)).toBe(false);
            expect(await hasUserAcceptedCurrentAgreement(charlie.id)).toBe(false);
        });
    });

    describe("Scenario: New volunteer joining the organization", () => {
        it("should block new user until they accept the agreement", async () => {
            // Given: Organization has an active agreement
            const agreement = await createTestAgreement({
                content: "# Volunteer Agreement\n\nBy accepting, you agree to handle recipient data with care.",
            });

            // When: A new volunteer joins
            const newVolunteer = await createTestUser({ githubUsername: "new_volunteer" });

            // Then: They cannot access protected content until they accept
            const status = await getUserAgreementStatus(newVolunteer.id);
            expect(status.hasAccepted).toBe(false);
            expect(status.currentAgreement?.content).toContain("Volunteer Agreement");

            // When: The volunteer reads and accepts the agreement
            await recordAgreementAcceptance(newVolunteer.id, agreement.id);

            // Then: They now have full access
            expect(await hasUserAcceptedCurrentAgreement(newVolunteer.id)).toBe(true);
        });
    });

    describe("Scenario: Agreement update requiring re-acceptance", () => {
        it("should require re-acceptance when legal terms are updated", async () => {
            // Given: Organization has an agreement that 3 users have accepted
            const originalAgreement = await createTestAgreement({
                content: "# Original Terms v1\n\nBasic data handling requirements.",
            });

            const user1 = await createTestUser({ githubUsername: "user1" });
            const user2 = await createTestUser({ githubUsername: "user2" });
            const user3 = await createTestUser({ githubUsername: "user3" });

            await recordAgreementAcceptance(user1.id, originalAgreement.id);
            await recordAgreementAcceptance(user2.id, originalAgreement.id);
            await recordAgreementAcceptance(user3.id, originalAgreement.id);

            // All users have access
            expect(await hasUserAcceptedCurrentAgreement(user1.id)).toBe(true);
            expect(await hasUserAcceptedCurrentAgreement(user2.id)).toBe(true);
            expect(await hasUserAcceptedCurrentAgreement(user3.id)).toBe(true);

            // When: Legal team requires updated terms with stricter data handling
            const updatedAgreement = await createAgreement(
                "# Updated Terms v2\n\nStricter GDPR requirements including data minimization.",
                "legal_admin",
            );

            // Then: All users must re-accept the new terms
            expect(await hasUserAcceptedCurrentAgreement(user1.id)).toBe(false);
            expect(await hasUserAcceptedCurrentAgreement(user2.id)).toBe(false);
            expect(await hasUserAcceptedCurrentAgreement(user3.id)).toBe(false);

            // When: Users gradually accept the new terms
            await recordAgreementAcceptance(user1.id, updatedAgreement.id);

            // Then: Only user1 has access, others still blocked
            expect(await hasUserAcceptedCurrentAgreement(user1.id)).toBe(true);
            expect(await hasUserAcceptedCurrentAgreement(user2.id)).toBe(false);
            expect(await hasUserAcceptedCurrentAgreement(user3.id)).toBe(false);

            // And: Acceptance count reflects partial adoption
            expect(await getAgreementAcceptanceCount(updatedAgreement.id)).toBe(1);
            expect(await getAgreementAcceptanceCount(originalAgreement.id)).toBe(3);
        });
    });

    describe("Scenario: Tracking agreement compliance across the organization", () => {
        it("should accurately track how many users have accepted each version", async () => {
            // Given: An organization tracking GDPR compliance over time
            const v1 = await createAgreement("Version 1 terms", "admin");

            // Phase 1: Initial rollout - 5 users accept v1
            const users = await Promise.all([
                createTestUser({ githubUsername: "user_a" }),
                createTestUser({ githubUsername: "user_b" }),
                createTestUser({ githubUsername: "user_c" }),
                createTestUser({ githubUsername: "user_d" }),
                createTestUser({ githubUsername: "user_e" }),
            ]);

            for (const user of users) {
                await recordAgreementAcceptance(user.id, v1.id);
            }

            expect(await getAgreementAcceptanceCount(v1.id)).toBe(5);

            // Phase 2: Updated agreement - only 3 users have accepted so far
            const v2 = await createAgreement("Version 2 terms with stricter requirements", "admin");

            // Only first 3 users accept the new version
            for (const user of users.slice(0, 3)) {
                await recordAgreementAcceptance(user.id, v2.id);
            }

            // Then: Admin can see compliance status
            const currentAgreement = await getCurrentAgreement();
            expect(currentAgreement?.version).toBe(2);
            expect(await getAgreementAcceptanceCount(v2.id)).toBe(3);

            // Historical data is preserved - v1 still shows all 5 acceptances
            expect(await getAgreementAcceptanceCount(v1.id)).toBe(5);

            // 2 users still need to accept the current version
            expect(await hasUserAcceptedCurrentAgreement(users[3].id)).toBe(false);
            expect(await hasUserAcceptedCurrentAgreement(users[4].id)).toBe(false);
        });
    });

    describe("Scenario: User accepting agreement unlocks protected features", () => {
        it("should grant access immediately after acceptance", async () => {
            // Given: A user who has been blocked from accessing recipient data
            const agreement = await createTestAgreement();
            const user = await createTestUser({ githubUsername: "blocked_user" });

            // Verify blocked state
            let status = await getUserAgreementStatus(user.id);
            expect(status.hasAccepted).toBe(false);
            expect(status.acceptedAt).toBeNull();

            // When: User accepts the agreement
            await recordAgreementAcceptance(user.id, agreement.id);

            // Then: Access is immediately granted with timestamp recorded
            status = await getUserAgreementStatus(user.id);
            expect(status.hasAccepted).toBe(true);
            expect(status.acceptedAt).toBeInstanceOf(Date);

            // And: The acceptance time is recent (within last minute)
            const acceptedTime = status.acceptedAt!.getTime();
            const now = Date.now();
            expect(now - acceptedTime).toBeLessThan(60000);
        });
    });

    describe("Scenario: Handling edge cases in production", () => {
        it("should handle user re-accepting same agreement (double-click protection)", async () => {
            // Given: A user accepting an agreement
            const agreement = await createTestAgreement();
            const user = await createTestUser();

            // When: User accidentally clicks accept twice (e.g., double-click)
            await recordAgreementAcceptance(user.id, agreement.id);
            await recordAgreementAcceptance(user.id, agreement.id);

            // Then: Only one acceptance record exists (idempotent operation)
            const count = await getAgreementAcceptanceCount(agreement.id);
            expect(count).toBe(1);

            // And: User still has access
            expect(await hasUserAcceptedCurrentAgreement(user.id)).toBe(true);
        });

        it("should maintain acceptance history when multiple versions exist", async () => {
            // Given: A user who has accepted multiple versions over time
            const user = await createTestUser({ githubUsername: "longtime_user" });

            const v1 = await createAgreement("Initial terms", "admin");
            await recordAgreementAcceptance(user.id, v1.id);

            const v2 = await createAgreement("Updated terms", "admin");
            await recordAgreementAcceptance(user.id, v2.id);

            const v3 = await createAgreement("Latest terms", "admin");
            await recordAgreementAcceptance(user.id, v3.id);

            // Then: User has current access
            expect(await hasUserAcceptedCurrentAgreement(user.id)).toBe(true);

            // And: All historical acceptances are preserved for audit
            expect(await getAgreementAcceptanceCount(v1.id)).toBe(1);
            expect(await getAgreementAcceptanceCount(v2.id)).toBe(1);
            expect(await getAgreementAcceptanceCount(v3.id)).toBe(1);
        });

        it("should correctly identify current agreement when multiple exist", async () => {
            // Given: Organization has published multiple agreement versions
            await createAgreement("First draft", "admin");
            await createAgreement("Improved version", "admin");
            const latest = await createAgreement("Final approved version", "legal");

            // When: System checks what the current agreement is
            const current = await getCurrentAgreement();

            // Then: It returns the most recent one
            expect(current?.id).toBe(latest.id);
            expect(current?.content).toBe("Final approved version");
            expect(current?.version).toBe(3);
        });
    });

    describe("Scenario: Mixed user states - Some accepted, some pending", () => {
        it("should correctly track partial compliance across organization", async () => {
            // Given: An organization with various user states
            const agreement = await createTestAgreement();

            // Some active users who have accepted
            const acceptedUsers = await Promise.all([
                createTestUser({ githubUsername: "compliant_1" }),
                createTestUser({ githubUsername: "compliant_2" }),
            ]);

            for (const user of acceptedUsers) {
                await recordAgreementAcceptance(user.id, agreement.id);
            }

            // Some users who haven't accepted yet
            const pendingUsers = await Promise.all([
                createTestUser({ githubUsername: "pending_1" }),
                createTestUser({ githubUsername: "pending_2" }),
                createTestUser({ githubUsername: "pending_3" }),
            ]);

            // When: Admin checks compliance
            const acceptedCount = await getAgreementAcceptanceCount(agreement.id);

            // Then: Accurate numbers are reported
            expect(acceptedCount).toBe(2);

            // And: Individual status checks work correctly
            for (const user of acceptedUsers) {
                expect(await hasUserAcceptedCurrentAgreement(user.id)).toBe(true);
            }

            for (const user of pendingUsers) {
                expect(await hasUserAcceptedCurrentAgreement(user.id)).toBe(false);
            }
        });
    });
});
