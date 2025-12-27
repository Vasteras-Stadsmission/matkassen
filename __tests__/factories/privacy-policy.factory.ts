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

    // Add small offset to created_at to avoid primary key collisions
    const createdAt = new Date();
    createdAt.setMilliseconds(createdAt.getMilliseconds() + policyCounter);

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
