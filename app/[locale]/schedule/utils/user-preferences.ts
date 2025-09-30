"use server";

import { db } from "@/app/db/drizzle";
import { users } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { protectedAction } from "@/app/utils/auth/protected-action";

/**
 * Get current user's favorite pickup location
 */
export const getUserFavoriteLocation = protectedAction(async (session): Promise<string | null> => {
    try {
        // Auth already verified by protectedAction wrapper
        const username = session.user?.name;
        if (!username) return null;

        const user = await db
            .select({ favorite_pickup_location_id: users.favorite_pickup_location_id })
            .from(users)
            .where(eq(users.github_username, username))
            .limit(1);

        return user[0]?.favorite_pickup_location_id || null;
    } catch (error) {
        console.error("Error getting user favorite location:", error);
        return null;
    }
});

/**
 * Set current user's favorite pickup location
 */
export const setUserFavoriteLocation = protectedAction(
    async (session, locationId: string | null): Promise<boolean> => {
        try {
            // Auth already verified by protectedAction wrapper
            const username = session.user?.name;
            if (!username) return false;

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

            return true;
        } catch (error) {
            console.error("Error setting user favorite location:", error);
            return false;
        }
    },
);

/**
 * @deprecated Use getUserFavoriteLocation instead
 */
export const getUserPreferredLocation = getUserFavoriteLocation;

/**
 * @deprecated Use setUserFavoriteLocation instead
 */
export const setUserPreferredLocation = setUserFavoriteLocation;

/**
 * Get current user info (for debugging/display)
 */
export const getCurrentUser = protectedAction(async _session => {
    // Auth already verified by protectedAction wrapper
    return {
        username: _session.user?.name || null,
        isLoggedIn: true, // If we got here, user is logged in
    };
});
