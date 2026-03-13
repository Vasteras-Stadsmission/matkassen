import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import { createTestUser, resetUserCounter } from "../../factories";
import { users } from "@/app/db/schema";
import { eq, isNotNull } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Mock the GitHub App helpers — we test DB logic, not GitHub API calls.
// vi.hoisted() ensures the variables exist before vi.mock() is hoisted.
// ---------------------------------------------------------------------------

const mockVerifyOrgExists = vi.hoisted(() => vi.fn<[], Promise<void>>());
const mockCheckMembership = vi.hoisted(() => vi.fn<[string, string], Promise<boolean>>());

vi.mock("@/app/utils/github-app", () => ({
    verifyOrganizationExists: mockVerifyOrgExists,
    checkOrganizationMembership: mockCheckMembership,
}));

// Scheduler imports must come after the mock so they pick up the mocked module
type SchedulerModule = typeof import("@/app/utils/scheduler");
let triggerOrgSync: SchedulerModule["triggerOrgSync"];

beforeEach(async () => {
    // The integration setup enables fake timers globally. Override here because
    // runOrgMembershipSync has a real setTimeout delay between API calls —
    // fake timers would cause the first test to hang until the 5 s timeout,
    // leaving orgSyncInFlight=true for all subsequent tests.
    vi.useRealTimers();

    resetUserCounter();

    // Reset mocks between tests
    mockVerifyOrgExists.mockReset().mockResolvedValue(undefined); // org exists by default
    mockCheckMembership.mockReset().mockResolvedValue(true); // everyone is a member by default

    // Set required env var
    process.env.GITHUB_ORG = "test-org";

    // Import (or re-use cached) scheduler module
    if (!triggerOrgSync) {
        const mod = await import("@/app/utils/scheduler");
        triggerOrgSync = mod.triggerOrgSync;
    }
});

// ---------------------------------------------------------------------------
// Core deactivation behaviour
// ---------------------------------------------------------------------------

describe("runOrgMembershipSync — core behaviour", () => {
    it("deactivates users that are no longer in the org", async () => {
        const member = await createTestUser({ github_username: "still-member" });
        const leaver = await createTestUser({ github_username: "has-left" });

        mockCheckMembership.mockImplementation(async (username: string) => {
            return username !== "has-left";
        });

        const result = await triggerOrgSync();

        expect(result.success).toBe(true);
        expect(result.deactivated).toBe(1);
        expect(result.errors).toHaveLength(0);

        const db = await getTestDb();
        const [memberRow] = await db
            .select({ deactivated_at: users.deactivated_at })
            .from(users)
            .where(eq(users.id, member.id));
        const [leaverRow] = await db
            .select({ deactivated_at: users.deactivated_at })
            .from(users)
            .where(eq(users.id, leaver.id));

        expect(memberRow.deactivated_at).toBeNull();
        expect(leaverRow.deactivated_at).not.toBeNull();
    });

    it("does not touch already-deactivated users", async () => {
        const db = await getTestDb();
        const formerUser = await createTestUser({ github_username: "already-gone" });
        const originalDate = new Date("2024-01-01");
        await db
            .update(users)
            .set({ deactivated_at: originalDate })
            .where(eq(users.id, formerUser.id));

        // Sync does not fetch deactivated users, so mockCheckMembership is never called for them
        mockCheckMembership.mockResolvedValue(false);

        const result = await triggerOrgSync();

        expect(result.success).toBe(true);
        expect(result.deactivated).toBe(0); // no active users to check

        const [row] = await db
            .select({ deactivated_at: users.deactivated_at })
            .from(users)
            .where(eq(users.id, formerUser.id));

        // Timestamp must be preserved — not overwritten
        expect(row.deactivated_at?.toISOString()).toBe(originalDate.toISOString());
    });

    it("preserves the original deactivation timestamp on repeated runs", async () => {
        const db = await getTestDb();
        const leaver = await createTestUser({ github_username: "repeated-leaver" });
        mockCheckMembership.mockResolvedValue(false);

        await triggerOrgSync(); // first run — sets deactivated_at

        const [after1] = await db
            .select({ deactivated_at: users.deactivated_at })
            .from(users)
            .where(eq(users.id, leaver.id));
        expect(after1.deactivated_at).not.toBeNull();
        const firstTimestamp = after1.deactivated_at!.toISOString();

        // Simulate time passing and run again
        await new Promise(r => setTimeout(r, 10));
        await triggerOrgSync(); // second run — must not overwrite timestamp

        const [after2] = await db
            .select({ deactivated_at: users.deactivated_at })
            .from(users)
            .where(eq(users.id, leaver.id));
        expect(after2.deactivated_at?.toISOString()).toBe(firstTimestamp);
    });

    it("skips a user on API error and does not deactivate them", async () => {
        await createTestUser({ github_username: "api-error-user" });

        mockCheckMembership.mockRejectedValue(new Error("GitHub rate limit"));

        const result = await triggerOrgSync();

        expect(result.success).toBe(true);
        expect(result.deactivated).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0]).toContain("api-error-user");
        expect(result.errors![0]).toContain("GitHub rate limit");

        const db = await getTestDb();
        const [row] = await db
            .select({ deactivated_at: users.deactivated_at })
            .from(users)
            .where(eq(users.github_username, "api-error-user"));
        expect(row.deactivated_at).toBeNull(); // never deactivated on error
    });

    it("deactivates some users even when others have API errors", async () => {
        await createTestUser({ github_username: "will-error" });
        const leaver = await createTestUser({ github_username: "definite-leaver" });
        await createTestUser({ github_username: "still-in" });

        mockCheckMembership.mockImplementation(async (username: string) => {
            if (username === "will-error") throw new Error("network failure");
            if (username === "definite-leaver") return false;
            return true;
        });

        const result = await triggerOrgSync();

        expect(result.success).toBe(true);
        expect(result.deactivated).toBe(1);
        expect(result.errors).toHaveLength(1);

        const db = await getTestDb();
        const [leaverRow] = await db
            .select({ deactivated_at: users.deactivated_at })
            .from(users)
            .where(eq(users.id, leaver.id));
        expect(leaverRow.deactivated_at).not.toBeNull();
    });

    it("deactivates nobody when all members are still in the org", async () => {
        await createTestUser({ github_username: "member-a" });
        await createTestUser({ github_username: "member-b" });
        mockCheckMembership.mockResolvedValue(true);

        const result = await triggerOrgSync();

        expect(result.success).toBe(true);
        expect(result.deactivated).toBe(0);
        expect(result.errors).toHaveLength(0);

        const db = await getTestDb();
        const deactivated = await db.select().from(users).where(isNotNull(users.deactivated_at));
        expect(deactivated).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Org pre-flight guard
// ---------------------------------------------------------------------------

describe("runOrgMembershipSync — org pre-flight guard", () => {
    it("aborts cleanly when the org does not exist — no users deactivated", async () => {
        await createTestUser({ github_username: "innocent-user" });

        mockVerifyOrgExists.mockRejectedValue(
            new Error("GitHub org 'test-org' not found — check GITHUB_ORG env var"),
        );

        const result = await triggerOrgSync();

        // runOrgMembershipSync catches the error and returns it in the errors array
        // so the overall call still succeeds (no uncaught exception)
        expect(result.success).toBe(true);
        expect(result.deactivated).toBe(0);
        expect(result.errors).toHaveLength(1);
        expect(result.errors![0]).toContain("not found");
        expect(mockCheckMembership).not.toHaveBeenCalled();

        const db = await getTestDb();
        const [row] = await db
            .select({ deactivated_at: users.deactivated_at })
            .from(users)
            .where(eq(users.github_username, "innocent-user"));
        expect(row.deactivated_at).toBeNull();
    });

    it("aborts when GITHUB_ORG is not set", async () => {
        const prev = process.env.GITHUB_ORG;
        delete process.env.GITHUB_ORG;

        try {
            await createTestUser({ github_username: "safe-user" });
            const result = await triggerOrgSync();

            expect(result.success).toBe(true);
            expect(result.deactivated).toBe(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors![0]).toMatch(/GITHUB_ORG/i);
            expect(mockCheckMembership).not.toHaveBeenCalled();
        } finally {
            process.env.GITHUB_ORG = prev;
        }
    });
});
