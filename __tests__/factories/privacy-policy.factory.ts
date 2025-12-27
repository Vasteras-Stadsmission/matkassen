import { getTestDb } from "../db/test-db";
import { privacyPolicies } from "@/app/db/schema";

let policyCounter = 0;

/**
 * Reset the policy counter. Call this in beforeEach if needed.
 */
export function resetPolicyCounter() {
    policyCounter = 0;
}

/**
 * Create a test privacy policy with default values.
 * Note: Primary key is (language, created_at)
 */
export async function createTestPrivacyPolicy(
    overrides: Partial<typeof privacyPolicies.$inferInsert> = {},
) {
    const db = await getTestDb();
    policyCounter++;

    // Use a fixed base timestamp plus counter to guarantee unique created_at values.
    // This avoids collisions regardless of wall-clock timing or test execution speed.
    const baseCreatedAt = new Date("2020-01-01T00:00:00.000Z");
    const createdAt = new Date(baseCreatedAt.getTime() + policyCounter * 1000);

    const defaults: typeof privacyPolicies.$inferInsert = {
        language: "sv",
        content: `Test policy content ${policyCounter}`,
        created_at: createdAt,
        created_by: "test-admin",
    };

    const [policy] = await db
        .insert(privacyPolicies)
        .values({ ...defaults, ...overrides })
        .returning();

    return policy;
}
