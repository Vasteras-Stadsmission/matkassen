import { getTestDb } from "../db/test-db";
import { verificationQuestions } from "@/app/db/schema";

let questionCounter = 0;

/**
 * Reset the question counter. Call this in beforeEach if needed.
 */
export function resetQuestionCounter() {
    questionCounter = 0;
}

/**
 * Create a test verification question with default values.
 */
export async function createTestVerificationQuestion(
    overrides: Partial<typeof verificationQuestions.$inferInsert> = {},
) {
    const db = await getTestDb();
    questionCounter++;

    const defaults: typeof verificationQuestions.$inferInsert = {
        question_text: `Testfråga ${questionCounter}`,
        help_text: `Hjälptext ${questionCounter}`,
        is_required: true,
        display_order: questionCounter,
        is_active: true,
    };

    const [question] = await db
        .insert(verificationQuestions)
        .values({ ...defaults, ...overrides })
        .returning();

    return question;
}

/**
 * Create an inactive (soft-deleted) verification question.
 */
export async function createTestInactiveQuestion(
    overrides: Partial<typeof verificationQuestions.$inferInsert> = {},
) {
    return createTestVerificationQuestion({
        ...overrides,
        is_active: false,
    });
}
