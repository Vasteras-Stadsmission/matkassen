"use server";

import { protectedAdminAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import { users, type UserRole } from "@/app/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
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

export interface FormerUserRow extends UserRow {
    deactivated_at: Date | string; // Date from DB; serialized to ISO string across Next.js Server→Client boundary
}

function revalidateUsersPage() {
    routing.locales.forEach(locale => {
        revalidatePath(`/${locale}/settings/users`, "page");
    });
}

export const getUsersWithStatus = protectedAdminAction(
    async (): Promise<ActionResult<{ active: UserRow[]; former: FormerUserRow[] }>> => {
        try {
            const rows = await db
                .select({
                    id: users.id,
                    github_username: users.github_username,
                    display_name: users.display_name,
                    avatar_url: users.avatar_url,
                    role: users.role,
                    deactivated_at: users.deactivated_at,
                })
                .from(users)
                .orderBy(users.display_name, users.github_username);

            const active: UserRow[] = rows
                .filter(r => r.deactivated_at === null)
                .map(r => ({
                    id: r.id,
                    github_username: r.github_username,
                    display_name: r.display_name,
                    avatar_url: r.avatar_url,
                    role: r.role,
                }));

            const former: FormerUserRow[] = rows
                .filter(r => r.deactivated_at !== null)
                .map(r => ({ ...r, deactivated_at: r.deactivated_at as Date }));

            return success({ active, former });
        } catch (error) {
            logError("Error fetching users", error);
            return failure({ code: "FETCH_FAILED", message: "Failed to fetch users" });
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
                    // Lock all active admin rows before counting to serialise concurrent demotions.
                    // Deactivated admins (deactivated_at IS NOT NULL) are excluded — they can't
                    // act as admins, so they must not count toward the last-admin guard.
                    await tx.execute(
                        sql`SELECT id FROM ${users} WHERE role = 'admin' AND deactivated_at IS NULL FOR UPDATE`,
                    );

                    const [{ count }] = await tx
                        .select({ count: sql<number>`count(*)::int` })
                        .from(users)
                        .where(and(eq(users.role, "admin"), isNull(users.deactivated_at)));

                    const targetRows = await tx
                        .select({ role: users.role, deactivated_at: users.deactivated_at })
                        .from(users)
                        .where(eq(users.id, userId))
                        .limit(1);

                    // Only guard active admins: a deactivated admin is not in `count`,
                    // so changing their role cannot remove the last active admin.
                    if (
                        targetRows[0]?.role === "admin" &&
                        targetRows[0]?.deactivated_at === null &&
                        count <= 1
                    ) {
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
