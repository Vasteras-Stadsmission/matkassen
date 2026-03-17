"use server";

import { db } from "@/app/db/drizzle";
import { users } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { logError } from "@/app/utils/logger";

export interface UserProfile {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
    profileComplete: boolean;
}

/**
 * Check if the current user's profile is complete (has first_name and last_name).
 */
export const getUserProfile = protectedAction(
    async (session): Promise<ActionResult<UserProfile | null>> => {
        try {
            const githubUsername = session.user?.githubUsername;
            if (!githubUsername) {
                return failure({ code: "AUTH_ERROR", message: "User not authenticated" });
            }

            const [user] = await db
                .select({
                    first_name: users.first_name,
                    last_name: users.last_name,
                    email: users.email,
                    phone: users.phone,
                })
                .from(users)
                .where(eq(users.github_username, githubUsername))
                .limit(1);

            if (!user) {
                return success(null);
            }

            return success({
                ...user,
                profileComplete: !!(user.first_name && user.last_name),
            });
        } catch (error) {
            logError("Error fetching user profile", error);
            return failure({ code: "FETCH_FAILED", message: "Failed to fetch profile" });
        }
    },
);

/**
 * Save the user's profile fields.
 */
export const saveUserProfile = protectedAction(
    async (
        session,
        data: { first_name: string; last_name: string; email?: string; phone?: string },
    ): Promise<ActionResult<void>> => {
        try {
            const githubUsername = session.user?.githubUsername;
            if (!githubUsername) {
                return failure({ code: "AUTH_ERROR", message: "User not authenticated" });
            }

            const firstName = data.first_name.trim();
            const lastName = data.last_name.trim();

            if (!firstName || !lastName) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "First name and last name are required",
                });
            }

            if (firstName.length > 100 || lastName.length > 100) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Name must be 100 characters or less",
                });
            }

            const emailValue = data.email?.trim() || null;
            if (emailValue) {
                if (emailValue.length > 255) {
                    return failure({
                        code: "VALIDATION_ERROR",
                        message: "Email must be 255 characters or less",
                    });
                }
                if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(emailValue)) {
                    return failure({
                        code: "VALIDATION_ERROR",
                        message: "Invalid email format",
                    });
                }
            }

            const phoneValue = data.phone?.trim() || null;
            if (phoneValue && phoneValue.length > 50) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Phone number must be 50 characters or less",
                });
            }

            await db
                .update(users)
                .set({
                    first_name: firstName,
                    last_name: lastName,
                    email: emailValue,
                    phone: phoneValue,
                })
                .where(eq(users.github_username, githubUsername));

            return success(undefined);
        } catch (error) {
            logError("Error saving user profile", error);
            return failure({ code: "SAVE_FAILED", message: "Failed to save profile" });
        }
    },
);
