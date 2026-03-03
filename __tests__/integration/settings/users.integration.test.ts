import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getTestDb } from "../../db/test-db";
import { createTestUser, resetUserCounter } from "../../factories";
import { users } from "@/app/db/schema";
import { eq } from "drizzle-orm";

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

// The caller's github username is controlled via this mock
let callerUsername = "caller-admin";

vi.mock("@/app/utils/auth/server-action-auth", () => ({
    verifyServerActionAuth: vi.fn(async () => ({
        success: true,
        data: {
            user: {
                githubUsername: callerUsername,
                role: "admin",
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
});

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
});

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
