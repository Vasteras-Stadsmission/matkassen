import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import { createTestUser, resetUserCounter } from "../../factories";
import { users } from "@/app/db/schema";
import { eq } from "drizzle-orm";

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

// The caller's identity is controlled via these variables.
// callerRole defaults to "admin" so most tests don't need to set it.
let callerUsername = "caller-admin";
let callerRole: "admin" | "handout_staff" = "admin";

vi.mock("@/app/utils/auth/server-action-auth", () => ({
    verifyServerActionAuth: vi.fn(async () => ({
        success: true,
        data: {
            user: {
                githubUsername: callerUsername,
                role: callerRole,
            },
        },
    })),
}));

type UsersActionsModule = typeof import("@/app/[locale]/settings/users/actions");
let getUsers: UsersActionsModule["getUsers"];
let updateUserRole: UsersActionsModule["updateUserRole"];

beforeAll(async () => {
    const mod = await import("@/app/[locale]/settings/users/actions");
    getUsers = mod.getUsers;
    updateUserRole = mod.updateUserRole;
});

beforeEach(() => {
    resetUserCounter();
    callerUsername = "caller-admin";
    callerRole = "admin";
});

// ---------------------------------------------------------------------------
// Role-based access control
// ---------------------------------------------------------------------------

describe("role-based access control", () => {
    it("getUsers — rejects handout_staff callers with FORBIDDEN", async () => {
        callerRole = "handout_staff";

        const result = await getUsers();

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("FORBIDDEN");
        }
    });

    it("updateUserRole — rejects handout_staff callers with FORBIDDEN", async () => {
        callerRole = "handout_staff";
        const target = await createTestUser({ role: "handout_staff" });

        const result = await updateUserRole(target.id, "admin");

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("FORBIDDEN");
        }

        // Role unchanged in DB
        const db = await getTestDb();
        const [row] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, target.id));
        expect(row.role).toBe("handout_staff");
    });
});

// ---------------------------------------------------------------------------
// getUsers — data integrity
// ---------------------------------------------------------------------------

describe("getUsers", () => {
    it("returns all users", async () => {
        const user = await createTestUser({ github_username: "listed-user" });

        const result = await getUsers();

        expect(result.success).toBe(true);
        if (!result.success) return;

        const found = result.data.find(u => u.id === user.id);
        expect(found).toBeDefined();
        expect(found!.github_username).toBe("listed-user");
    });

    it("returns all expected fields for each user", async () => {
        const created = await createTestUser({
            github_username: "fields-test-user",
            display_name: "Fields Test",
            avatar_url: "https://example.com/avatar.png",
            role: "handout_staff",
        });

        const result = await getUsers();

        expect(result.success).toBe(true);
        if (!result.success) return;

        const found = result.data.find(u => u.id === created.id);
        expect(found).toBeDefined();
        expect(found!.github_username).toBe("fields-test-user");
        expect(found!.display_name).toBe("Fields Test");
        expect(found!.avatar_url).toBe("https://example.com/avatar.png");
        expect(found!.role).toBe("handout_staff");
    });

    it("includes users with null display_name", async () => {
        const created = await createTestUser({
            github_username: "no-display-name",
            display_name: null,
        });

        const result = await getUsers();

        expect(result.success).toBe(true);
        if (!result.success) return;

        const found = result.data.find(u => u.id === created.id);
        expect(found).toBeDefined();
        expect(found!.display_name).toBeNull();
    });

    it("returns users sorted alphabetically by display_name", async () => {
        await createTestUser({ github_username: "z-user", display_name: "Zelda" });
        await createTestUser({ github_username: "a-user", display_name: "Alice" });
        await createTestUser({ github_username: "m-user", display_name: "Mike" });

        const result = await getUsers();

        expect(result.success).toBe(true);
        if (!result.success) return;

        const names = result.data
            .filter(u => ["Zelda", "Alice", "Mike"].includes(u.display_name ?? ""))
            .map(u => u.display_name);

        expect(names).toEqual(["Alice", "Mike", "Zelda"]);
    });
});

// ---------------------------------------------------------------------------
// New user default role
// ---------------------------------------------------------------------------

describe("user default role", () => {
    it("new users are inserted with handout_staff role by default", async () => {
        const db = await getTestDb();

        const [inserted] = await db
            .insert(users)
            .values({ github_username: "brand-new-user" })
            .returning();

        expect(inserted.role).toBe("handout_staff");
    });
});

// ---------------------------------------------------------------------------
// updateUserRole — anti-lockout guards
// ---------------------------------------------------------------------------

describe("updateUserRole — anti-lockout guards", () => {
    it("rejects changing your own role", async () => {
        const caller = await createTestUser({
            github_username: "caller-admin",
            role: "admin",
        });

        const result = await updateUserRole(caller.id, "handout_staff");

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("CANNOT_CHANGE_SELF_ROLE");
        }

        // Role unchanged in DB
        const db = await getTestDb();
        const [row] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, caller.id));
        expect(row.role).toBe("admin");
    });

    it("rejects demoting the last admin", async () => {
        // Set caller to a username not in the DB — the self-demotion guard won't
        // match any row, so we reach the last-admin guard cleanly.
        callerUsername = "phantom-caller-not-in-db";

        const sole = await createTestUser({ github_username: "sole-admin", role: "admin" });

        const result = await updateUserRole(sole.id, "handout_staff");

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("CANNOT_DEMOTE_LAST_ADMIN");
        }

        // sole-admin is still admin in DB
        const db = await getTestDb();
        const [row] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, sole.id));
        expect(row.role).toBe("admin");
    });

    it("allows promoting handout_staff to admin", async () => {
        await createTestUser({ github_username: "caller-admin", role: "admin" });
        const target = await createTestUser({
            github_username: "target-staff",
            role: "handout_staff",
        });

        const result = await updateUserRole(target.id, "admin");

        expect(result.success).toBe(true);

        const db = await getTestDb();
        const [row] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, target.id));
        expect(row.role).toBe("admin");
    });

    it("allows demoting an admin when other admins exist", async () => {
        const caller = await createTestUser({ github_username: "caller-admin", role: "admin" });
        const target = await createTestUser({ github_username: "target-admin", role: "admin" });

        const result = await updateUserRole(target.id, "handout_staff");

        expect(result.success).toBe(true);

        const db = await getTestDb();
        const [row] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, target.id));
        expect(row.role).toBe("handout_staff");

        // Caller still admin
        const [callerRow] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, caller.id));
        expect(callerRow.role).toBe("admin");
    });
});

// ---------------------------------------------------------------------------
// updateUserRole — edge cases
// ---------------------------------------------------------------------------

describe("updateUserRole — edge cases", () => {
    it("succeeds when assigning the same role (idempotent)", async () => {
        await createTestUser({ github_username: "caller-admin", role: "admin" });
        const target = await createTestUser({ github_username: "other-admin", role: "admin" });

        const result = await updateUserRole(target.id, "admin");

        expect(result.success).toBe(true);

        const db = await getTestDb();
        const [row] = await db
            .select({ role: users.role })
            .from(users)
            .where(eq(users.id, target.id));
        expect(row.role).toBe("admin");
    });

    it("returns USER_NOT_FOUND for a non-existent userId", async () => {
        // Phantom caller bypasses the self-demotion DB look-up
        callerUsername = "phantom-caller-not-in-db";
        // One admin must exist so the last-admin guard doesn't fire
        await createTestUser({ github_username: "real-admin", role: "admin" });

        const nonExistentId = "00000000-0000-0000-0000-000000000000";
        const result = await updateUserRole(nonExistentId, "handout_staff");

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.code).toBe("USER_NOT_FOUND");
        }
    });
});
