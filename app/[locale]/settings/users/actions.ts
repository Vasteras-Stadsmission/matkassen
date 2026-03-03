"use server";

import { protectedAdminAction } from "@/app/utils/auth/protected-action";
import { success, validationError, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import { users, type UserRole } from "@/app/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { routing } from "@/app/i18n/routing";
import { logError } from "@/app/utils/logger";

export type { UserRole };

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

export const getUsers = protectedAdminAction(
    async (): Promise<ActionResult<UserRow[]>> => {
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
            return validationError("Failed to fetch users");
        }
    },
);

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
                return validationError("Cannot change your own role");
            }

            // Anti-lockout: ensure at least one admin remains after the change
            if (role !== "admin") {
                const targetRows = await db
                    .select({ role: users.role })
                    .from(users)
                    .where(eq(users.id, userId))
                    .limit(1);
                const targetRole = targetRows[0]?.role;

                if (targetRole === "admin") {
                    const countRows = await db
                        .select({ count: sql<number>`count(*)::int` })
                        .from(users)
                        .where(eq(users.role, "admin"));
                    const adminCount = countRows[0]?.count ?? 0;

                    if (adminCount <= 1) {
                        return validationError("Cannot demote the last admin");
                    }
                }
            }

            await db.update(users).set({ role }).where(eq(users.id, userId));
            revalidateUsersPage();
            return success(undefined);
        } catch (error) {
            logError("Error updating user role", error);
            return validationError("Failed to update user role");
        }
    },
);
