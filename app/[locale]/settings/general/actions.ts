"use server";

import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import { verificationQuestions } from "@/app/db/schema";
import { eq, and, asc, max, sql, inArray } from "drizzle-orm";
import { nanoid } from "@/app/db/schema";
import { revalidatePath } from "next/cache";
import { routing } from "@/app/i18n/routing";

/**
 * Revalidates the settings/general page for all supported locales.
 * Call this after any mutation to verification questions.
 */
function revalidateSettingsPage() {
    routing.locales.forEach(locale => {
        revalidatePath(`/${locale}/settings/general`, "page");
    });
}

export interface VerificationQuestion {
    id: string;
    question_text_sv: string;
    question_text_en: string;
    help_text_sv: string | null;
    help_text_en: string | null;
    is_required: boolean;
    display_order: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface CreateQuestionData {
    question_text_sv: string;
    question_text_en: string;
    help_text_sv?: string;
    help_text_en?: string;
    is_required?: boolean;
}

export interface UpdateQuestionData {
    question_text_sv?: string;
    question_text_en?: string;
    help_text_sv?: string;
    help_text_en?: string;
    is_required?: boolean;
}

export const listVerificationQuestions = protectedAction(
    async (): Promise<ActionResult<VerificationQuestion[]>> => {
        try {
            const questions = await db
                .select()
                .from(verificationQuestions)
                .where(eq(verificationQuestions.is_active, true))
                .orderBy(asc(verificationQuestions.display_order));

            return success(questions);
        } catch (error) {
            console.error("Error fetching verification questions:", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch verification questions",
            });
        }
    },
);

export const createVerificationQuestion = protectedAction(
    async (session, data: CreateQuestionData): Promise<ActionResult<VerificationQuestion>> => {
        try {
            // Validate required fields
            if (!data.question_text_sv?.trim() || !data.question_text_en?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Both Swedish and English question text are required",
                });
            }

            // Get next display order
            const maxOrderResult = await db
                .select({ maxOrder: max(verificationQuestions.display_order) })
                .from(verificationQuestions)
                .where(eq(verificationQuestions.is_active, true));

            const nextOrder = (maxOrderResult[0]?.maxOrder ?? -1) + 1;

            const [newQuestion] = await db
                .insert(verificationQuestions)
                .values({
                    id: nanoid(8),
                    question_text_sv: data.question_text_sv.trim(),
                    question_text_en: data.question_text_en.trim(),
                    help_text_sv: data.help_text_sv?.trim() || null,
                    help_text_en: data.help_text_en?.trim() || null,
                    is_required: data.is_required ?? true,
                    display_order: nextOrder,
                    is_active: true,
                })
                .returning();

            revalidateSettingsPage();
            return success(newQuestion);
        } catch (error) {
            console.error("Error creating verification question:", error);
            return failure({
                code: "CREATE_FAILED",
                message: "Failed to create verification question",
            });
        }
    },
);

export const updateVerificationQuestion = protectedAction(
    async (
        session,
        questionId: string,
        data: UpdateQuestionData,
    ): Promise<ActionResult<VerificationQuestion>> => {
        try {
            const updateData: Record<string, unknown> = {
                updated_at: new Date(),
            };

            if (data.question_text_sv !== undefined) {
                if (!data.question_text_sv.trim()) {
                    return failure({
                        code: "VALIDATION_ERROR",
                        message: "Swedish question text cannot be empty",
                    });
                }
                updateData.question_text_sv = data.question_text_sv.trim();
            }

            if (data.question_text_en !== undefined) {
                if (!data.question_text_en.trim()) {
                    return failure({
                        code: "VALIDATION_ERROR",
                        message: "English question text cannot be empty",
                    });
                }
                updateData.question_text_en = data.question_text_en.trim();
            }

            if (data.help_text_sv !== undefined) {
                updateData.help_text_sv = data.help_text_sv?.trim() || null;
            }

            if (data.help_text_en !== undefined) {
                updateData.help_text_en = data.help_text_en?.trim() || null;
            }

            if (data.is_required !== undefined) {
                updateData.is_required = data.is_required;
            }

            const [updatedQuestion] = await db
                .update(verificationQuestions)
                .set(updateData)
                .where(
                    and(
                        eq(verificationQuestions.id, questionId),
                        eq(verificationQuestions.is_active, true),
                    ),
                )
                .returning();

            if (!updatedQuestion) {
                return failure({ code: "NOT_FOUND", message: "Question not found" });
            }

            revalidateSettingsPage();
            return success(updatedQuestion);
        } catch (error) {
            console.error("Error updating verification question:", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update verification question",
            });
        }
    },
);

export const deleteVerificationQuestion = protectedAction(
    async (session, questionId: string): Promise<ActionResult<void>> => {
        try {
            const [deletedQuestion] = await db
                .update(verificationQuestions)
                .set({
                    is_active: false,
                    updated_at: new Date(),
                })
                .where(
                    and(
                        eq(verificationQuestions.id, questionId),
                        eq(verificationQuestions.is_active, true),
                    ),
                )
                .returning();

            if (!deletedQuestion) {
                return failure({ code: "NOT_FOUND", message: "Question not found" });
            }

            revalidateSettingsPage();
            return success(undefined);
        } catch (error) {
            console.error("Error deleting verification question:", error);
            return failure({
                code: "DELETE_FAILED",
                message: "Failed to delete verification question",
            });
        }
    },
);

export const reorderVerificationQuestions = protectedAction(
    async (session, questionIds: string[]): Promise<ActionResult<void>> => {
        try {
            if (questionIds.length === 0) {
                return success(undefined);
            }

            // Use SQL CASE statement to update all display_order values in a single query
            // This is much more efficient than N sequential updates, especially for large checklists
            await db.transaction(async tx => {
                // Build the CASE statement safely using Drizzle's sql template
                const caseStatements = questionIds.map(
                    (id, index) => sql`WHEN ${verificationQuestions.id} = ${id} THEN ${index}`,
                );

                const caseExpression = sql.join(caseStatements, sql.raw(" "));

                await tx
                    .update(verificationQuestions)
                    .set({
                        display_order: sql`CASE ${caseExpression} END`,
                        updated_at: new Date(),
                    })
                    .where(
                        and(
                            inArray(verificationQuestions.id, questionIds),
                            eq(verificationQuestions.is_active, true),
                        ),
                    );
            });

            revalidateSettingsPage();
            return success(undefined);
        } catch (error) {
            console.error("Error reordering verification questions:", error);
            return failure({
                code: "REORDER_FAILED",
                message: "Failed to reorder verification questions",
            });
        }
    },
);
