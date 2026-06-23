import { getTestDb } from "../db/test-db";
import { users } from "@/app/db/schema";

let userCounter = 0;

/**
 * Reset the user counter. Call this in beforeEach if needed.
 */
export function resetUserCounter() {
    userCounter = 0;
}

/**
 * Create a test user (admin/volunteer).
 * GitHub usernames are auto-generated to be unique.
 */
export async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}) {
    const db = await getTestDb();
    userCounter++;

    const defaults: typeof users.$inferInsert = {
        github_username: `testuser${userCounter}`,
        display_name: `Test User ${userCounter}`,
        avatar_url: `https://avatars.githubusercontent.com/u/${1000 + userCounter}`,
    };

    const [user] = await db
        .insert(users)
        .values({ ...defaults, ...overrides })
        .returning();

    return user;
}
