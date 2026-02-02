import { getTestDb } from "../db/test-db";
import { userAgreements, userAgreementAcceptances } from "@/app/db/schema";

let agreementCounter = 0;

/**
 * Reset the agreement counter. Call this in beforeEach if needed.
 */
export function resetAgreementCounter() {
    agreementCounter = 0;
}

/**
 * Create a test user agreement.
 */
export async function createTestAgreement(
    overrides: Partial<typeof userAgreements.$inferInsert> = {},
) {
    const db = await getTestDb();
    agreementCounter++;

    const defaults: typeof userAgreements.$inferInsert = {
        content: `# Test Agreement ${agreementCounter}\n\nThis is test agreement content.`,
        version: agreementCounter,
        effective_from: new Date(),
        created_by: `testadmin${agreementCounter}`,
    };

    const [agreement] = await db
        .insert(userAgreements)
        .values({ ...defaults, ...overrides })
        .returning();

    return agreement;
}

/**
 * Create a test user agreement with a specific effective date.
 */
export async function createTestAgreementEffectiveAt(
    effectiveFrom: Date,
    overrides: Partial<typeof userAgreements.$inferInsert> = {},
) {
    return createTestAgreement({
        ...overrides,
        effective_from: effectiveFrom,
    });
}

/**
 * Create a user agreement acceptance record.
 */
export async function createTestAgreementAcceptance(userId: string, agreementId: string) {
    const db = await getTestDb();

    await db
        .insert(userAgreementAcceptances)
        .values({
            user_id: userId,
            agreement_id: agreementId,
        })
        .onConflictDoNothing();
}
