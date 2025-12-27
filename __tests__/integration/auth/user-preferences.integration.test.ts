/**
 * Integration tests for user preferences database operations.
 *
 * Tests that user preferences (favorite location) are stored and retrieved
 * using github_username, not display name. This ensures users with custom
 * display names can still save preferences.
 *
 * Note: We test the database operations directly since the actual action
 * functions are wrapped with protectedAction which handles session auth.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { getTestDb } from "../../db/test-db";
import {
    createTestUser,
    createTestUserWithFavoriteLocation,
    createTestLocationWithSchedule,
    resetUserCounter,
    resetLocationCounter,
} from "../../factories";
import { users } from "@/app/db/schema";
import { eq } from "drizzle-orm";

describe("User Preferences - Integration Tests", () => {
    beforeEach(() => {
        resetUserCounter();
        resetLocationCounter();
    });

    describe("Favorite Pickup Location", () => {
        it("should store favorite location by github_username", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            // Create user with favorite location
            const user = await createTestUserWithFavoriteLocation(location.id, {
                github_username: "johndoe123",
                display_name: "John Doe", // Different from username
            });

            // Retrieve by github_username
            const [result] = await db
                .select({ favorite_pickup_location_id: users.favorite_pickup_location_id })
                .from(users)
                .where(eq(users.github_username, "johndoe123"))
                .limit(1);

            expect(result).toBeDefined();
            expect(result.favorite_pickup_location_id).toBe(location.id);
        });

        it("should update existing user favorite location", async () => {
            const db = await getTestDb();
            const { location: location1 } = await createTestLocationWithSchedule();
            const { location: location2 } = await createTestLocationWithSchedule();

            // Create user with first favorite location
            const user = await createTestUserWithFavoriteLocation(location1.id, {
                github_username: "testuser",
            });

            expect(user.favorite_pickup_location_id).toBe(location1.id);

            // Update to second location
            await db
                .update(users)
                .set({ favorite_pickup_location_id: location2.id })
                .where(eq(users.github_username, "testuser"));

            // Verify update
            const [updated] = await db
                .select({ favorite_pickup_location_id: users.favorite_pickup_location_id })
                .from(users)
                .where(eq(users.github_username, "testuser"))
                .limit(1);

            expect(updated.favorite_pickup_location_id).toBe(location2.id);
        });

        it("should allow null favorite location", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            // Create user with favorite location
            await createTestUserWithFavoriteLocation(location.id, {
                github_username: "testuser",
            });

            // Set to null (clear favorite)
            await db
                .update(users)
                .set({ favorite_pickup_location_id: null })
                .where(eq(users.github_username, "testuser"));

            // Verify cleared
            const [updated] = await db
                .select({ favorite_pickup_location_id: users.favorite_pickup_location_id })
                .from(users)
                .where(eq(users.github_username, "testuser"))
                .limit(1);

            expect(updated.favorite_pickup_location_id).toBeNull();
        });

        it("should create new user if not exists (upsert pattern)", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            // User doesn't exist yet
            const [existingUser] = await db
                .select()
                .from(users)
                .where(eq(users.github_username, "newuser"))
                .limit(1);

            expect(existingUser).toBeUndefined();

            // Create user with favorite location
            await db.insert(users).values({
                github_username: "newuser",
                favorite_pickup_location_id: location.id,
            });

            // Verify user was created
            const [createdUser] = await db
                .select()
                .from(users)
                .where(eq(users.github_username, "newuser"))
                .limit(1);

            expect(createdUser).toBeDefined();
            expect(createdUser.github_username).toBe("newuser");
            expect(createdUser.favorite_pickup_location_id).toBe(location.id);
        });

        it("REGRESSION: user with display name different from github_username can save preferences", async () => {
            const db = await getTestDb();
            const { location } = await createTestLocationWithSchedule();

            // Create user with display name different from github username
            // This was previously a bug where display name was used for lookups
            await createTestUser({
                github_username: "github_user_123",
                display_name: "Fancy Display Name",
            });

            // Set favorite location using github_username
            await db
                .update(users)
                .set({ favorite_pickup_location_id: location.id })
                .where(eq(users.github_username, "github_user_123"));

            // Verify lookup by github_username works
            const [result] = await db
                .select({ favorite_pickup_location_id: users.favorite_pickup_location_id })
                .from(users)
                .where(eq(users.github_username, "github_user_123"))
                .limit(1);

            expect(result.favorite_pickup_location_id).toBe(location.id);

            // Verify lookup by display_name does NOT work (would return nothing)
            const [byDisplayName] = await db
                .select()
                .from(users)
                .where(eq(users.github_username, "Fancy Display Name"))
                .limit(1);

            expect(byDisplayName).toBeUndefined();
        });

        it("should enforce foreign key constraint for pickup location", async () => {
            const db = await getTestDb();

            // Create user
            const user = await createTestUser({
                github_username: "testuser",
            });

            // Try to set non-existent location - should fail
            await expect(
                db
                    .update(users)
                    .set({ favorite_pickup_location_id: "non-existent-location" })
                    .where(eq(users.github_username, "testuser")),
            ).rejects.toThrow();
        });
    });

    describe("github_username uniqueness", () => {
        it("should enforce unique github_username constraint", async () => {
            await createTestUser({ github_username: "uniqueuser" });

            // Try to create another user with same github_username
            await expect(
                createTestUser({ github_username: "uniqueuser" }),
            ).rejects.toThrow();
        });

        it("should allow same display_name for different github_usernames", async () => {
            const user1 = await createTestUser({
                github_username: "user1",
                display_name: "Same Name",
            });
            const user2 = await createTestUser({
                github_username: "user2",
                display_name: "Same Name",
            });

            expect(user1.display_name).toBe("Same Name");
            expect(user2.display_name).toBe("Same Name");
            expect(user1.github_username).not.toBe(user2.github_username);
        });
    });
});
