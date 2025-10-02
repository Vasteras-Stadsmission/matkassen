"use server";

import { db } from "@/app/db/drizzle";
import { users } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";

/**
 * Get current user's favorite pickup location
 */
export const getUserFavoriteLocation = protectedAction(
    async (session): Promise<ActionResult<string | null>> => {
        try {
            // Auth already verified by protectedAction wrapper
            const username = session.user?.githubUsername;
            if (!username) {
                return failure({
                    code: "NO_USERNAME",
                    message: "User session does not contain GitHub username",
                    field: "username",
                });
            }

            const user = await db
                .select({ favorite_pickup_location_id: users.favorite_pickup_location_id })
                .from(users)
                .where(eq(users.github_username, username))
                .limit(1);

            return success(user[0]?.favorite_pickup_location_id || null);
        } catch (error) {
            console.error("Error getting user favorite location:", error);
            return failure({
                code: "DATABASE_ERROR",
                message: "Failed to fetch user favorite location",
            });
        }
    },
);

/**
 * Set current user's favorite pickup location
 */
export const setUserFavoriteLocation = protectedAction(
    async (session, locationId: string | null): Promise<ActionResult<void>> => {
        try {
            // Auth already verified by protectedAction wrapper
            const username = session.user?.githubUsername;
            if (!username) {
                return failure({
                    code: "NO_USERNAME",
                    message: "User session does not contain GitHub username",
                    field: "username",
                });
            }

            // First, try to update existing user
            const updated = await db
                .update(users)
                .set({ favorite_pickup_location_id: locationId })
                .where(eq(users.github_username, username))
                .returning({ id: users.id });

            // If no user exists, create one
            if (updated.length === 0) {
                await db.insert(users).values({
                    github_username: username,
                    favorite_pickup_location_id: locationId,
                });
            }

            return success(undefined);
        } catch (error) {
            console.error("Error setting user favorite location:", error);
            return failure({
                code: "DATABASE_ERROR",
                message: "Failed to update user favorite location",
            });
        }
    },
);

/**
 * @deprecated Use getUserFavoriteLocation instead
 */
export const getUserPreferredLocation = getUserFavoriteLocation;

/**
 * @deprecated Use setUserPreferredLocation instead
 */
export const setUserPreferredLocation = setUserFavoriteLocation;

/**
 * Get current user info (for debugging/display)
 */
export const getCurrentUser = protectedAction(
    async (session): Promise<ActionResult<{ username: string | null; isLoggedIn: boolean }>> => {
        // Auth already verified by protectedAction wrapper
        return success({
            username: session.user?.githubUsername || null,
            isLoggedIn: true, // If we got here, user is logged in
        });
    },
);
