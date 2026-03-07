"use server";

import { protectedAdminAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import { users, type UserRole } from "@/app/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { routing } from "@/app/i18n/routing";
import { logError } from "@/app/utils/logger";

export interface UserRow {
    id: string;
    github_username: string;
    display_name: string | null;
    avatar_url: string | null;
    role: UserRole;
}

function revalidateUsersPage() {
    routing.locales.forEach(locale => {
        revalidatePath(`/${locale}/settings/users`, "page");
    });
}

export const getUsers = protectedAdminAction(async (): Promise<ActionResult<UserRow[]>> => {
    try {
        const rows = await db
            .select({
                id: users.id,
                github_username: users.github_username,
                display_name: users.display_name,
                avatar_url: users.avatar_url,
                role: users.role,
            })
            .from(users)
            .orderBy(users.display_name, users.github_username);
        return success(rows);
    } catch (error) {
        logError("Error fetching users", error);
        return failure({ code: "FETCH_FAILED", message: "Failed to fetch users" });
    }
});

export const updateUserRole = protectedAdminAction(
    async (session, userId: string, role: UserRole): Promise<ActionResult<void>> => {
        try {
            // Anti-lockout: can't change your own role
            const currentUserRows = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.github_username, session.user?.githubUsername ?? ""))
                .limit(1);
            const currentUser = currentUserRows[0];

            if (currentUser?.id === userId) {
                return failure({
                    code: "CANNOT_CHANGE_SELF_ROLE",
                    message: "Cannot change your own role",
                });
            }

            // Anti-lockout: ensure at least one admin remains after the change.
            // Wrapped in a transaction with a FOR UPDATE lock on all admin rows to prevent
            // two concurrent demotions from both passing the count check.
            await db.transaction(async tx => {
                if (role !== "admin") {
                    // Lock all admin rows before counting to serialise concurrent demotions
                    await tx.execute(sql`SELECT id FROM ${users} WHERE role = 'admin' FOR UPDATE`);

                    const [{ count }] = await tx
                        .select({ count: sql<number>`count(*)::int` })
                        .from(users)
                        .where(eq(users.role, "admin"));

                    const targetRows = await tx
                        .select({ role: users.role })
                        .from(users)
                        .where(eq(users.id, userId))
                        .limit(1);

                    if (targetRows[0]?.role === "admin" && count <= 1) {
                        throw Object.assign(new Error("Cannot demote the last admin"), {
                            code: "CANNOT_DEMOTE_LAST_ADMIN",
                        });
                    }
                }

                const updated = await tx
                    .update(users)
                    .set({ role })
                    .where(eq(users.id, userId))
                    .returning({ id: users.id });
                if (updated.length === 0) {
                    throw Object.assign(new Error("User not found"), {
                        code: "USER_NOT_FOUND",
                    });
                }
            });

            revalidateUsersPage();
            return success(undefined);
        } catch (error) {
            if (
                error instanceof Error &&
                (error as Error & { code?: string }).code === "CANNOT_DEMOTE_LAST_ADMIN"
            ) {
                return failure({
                    code: "CANNOT_DEMOTE_LAST_ADMIN",
                    message: "Cannot demote the last admin",
                });
            }
            if (
                error instanceof Error &&
                (error as Error & { code?: string }).code === "USER_NOT_FOUND"
            ) {
                return failure({ code: "USER_NOT_FOUND", message: "User not found" });
            }
            logError("Error updating user role", error);
            return failure({ code: "UPDATE_FAILED", message: "Failed to update user role" });
        }
    },
);
