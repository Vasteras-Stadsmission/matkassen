"use server";

import { db } from "@/app/db/drizzle";
import { users } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

/**
 * Get current user's favorite pickup location
 */
export async function getUserFavoriteLocation(): Promise<string | null> {
    try {
        const session = await auth();
        if (!session?.user?.name) return null;

        const user = await db
            .select({ favorite_pickup_location_id: users.favorite_pickup_location_id })
            .from(users)
            .where(eq(users.github_username, session.user.name))
            .limit(1);

        return user[0]?.favorite_pickup_location_id || null;
    } catch (error) {
        console.error("Error getting user favorite location:", error);
        return null;
    }
}

/**
 * Set current user's favorite pickup location
 */
export async function setUserFavoriteLocation(locationId: string | null): Promise<boolean> {
    try {
        const session = await auth();
        if (!session?.user?.name) return false;

        // First, try to update existing user
        const updated = await db
            .update(users)
            .set({ favorite_pickup_location_id: locationId })
            .where(eq(users.github_username, session.user.name))
            .returning({ id: users.id });

        // If no user exists, create one
        if (updated.length === 0) {
            await db.insert(users).values({
                github_username: session.user.name,
                favorite_pickup_location_id: locationId,
            });
        }

        return true;
    } catch (error) {
        console.error("Error setting user favorite location:", error);
        return false;
    }
}

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
export async function getCurrentUser() {
    try {
        const session = await auth();
        return {
            username: session?.user?.name || null,
            isLoggedIn: !!session?.user,
        };
    } catch (error) {
        console.error("Error getting current user:", error);
        return {
            username: null,
            isLoggedIn: false,
        };
    }
}
