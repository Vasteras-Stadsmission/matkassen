"use server";

import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import {
    verificationQuestions,
    privacyPolicies,
    globalSettings,
    userAgreements,
    userAgreementAcceptances,
} from "@/app/db/schema";
import { eq, and, asc, max, sql, inArray, desc } from "drizzle-orm";
import { nanoid } from "@/app/db/schema";
import { revalidatePath } from "next/cache";
import { routing } from "@/app/i18n/routing";
import { logError } from "@/app/utils/logger";
import {
    NOSHOW_FOLLOWUP_ENABLED_KEY,
    NOSHOW_CONSECUTIVE_THRESHOLD_KEY,
    NOSHOW_TOTAL_THRESHOLD_KEY,
    NOSHOW_CONSECUTIVE_MIN,
    NOSHOW_CONSECUTIVE_MAX,
    NOSHOW_CONSECUTIVE_DEFAULT,
    NOSHOW_TOTAL_MIN,
    NOSHOW_TOTAL_MAX,
    NOSHOW_TOTAL_DEFAULT,
} from "@/app/constants/noshow-settings";

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
    question_text: string;
    help_text: string | null;
    is_required: boolean;
    display_order: number;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
}

export interface CreateQuestionData {
    question_text: string;
    help_text?: string;
    is_required?: boolean;
}

export interface UpdateQuestionData {
    question_text?: string;
    help_text?: string;
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
            logError("Error fetching verification questions", error);
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
            if (!data.question_text?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Question text cannot be empty",
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
                    question_text: data.question_text.trim(),
                    help_text: data.help_text?.trim() || null,
                    is_required: data.is_required ?? true,
                    display_order: nextOrder,
                    is_active: true,
                })
                .returning();

            revalidateSettingsPage();
            return success(newQuestion);
        } catch (error) {
            logError("Error creating verification question", error);
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

            if (data.question_text !== undefined) {
                if (!data.question_text.trim()) {
                    return failure({
                        code: "VALIDATION_ERROR",
                        message: "Question text cannot be empty",
                    });
                }
                updateData.question_text = data.question_text.trim();
            }

            if (data.help_text !== undefined) {
                updateData.help_text = data.help_text?.trim() || null;
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
            logError("Error updating verification question", error);
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
            logError("Error deleting verification question", error);
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
            logError("Error reordering verification questions", error);
            return failure({
                code: "REORDER_FAILED",
                message: "Failed to reorder verification questions",
            });
        }
    },
);

// ============================================================================
// Privacy Policy Actions
// ============================================================================

export interface PrivacyPolicy {
    language: string;
    content: string;
    created_at: Date;
    created_by: string | null;
}

/**
 * Get the latest privacy policy for a specific language
 */
export const getPrivacyPolicy = protectedAction(
    async (session, language: string): Promise<ActionResult<PrivacyPolicy | null>> => {
        try {
            const [policy] = await db
                .select()
                .from(privacyPolicies)
                .where(eq(privacyPolicies.language, language))
                .orderBy(desc(privacyPolicies.created_at))
                .limit(1);

            return success(policy || null);
        } catch (error) {
            logError("Error fetching privacy policy", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch privacy policy",
            });
        }
    },
);

/**
 * Get the latest privacy policies for all languages
 */
export const getAllPrivacyPolicies = protectedAction(
    async (): Promise<ActionResult<PrivacyPolicy[]>> => {
        try {
            // Get the latest policy for each language using a subquery
            const policies = await db.execute(sql`
                SELECT DISTINCT ON (language) language, content, created_at, created_by
                FROM privacy_policies
                ORDER BY language, created_at DESC
            `);

            return success(policies as unknown as PrivacyPolicy[]);
        } catch (error) {
            logError("Error fetching all privacy policies", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch privacy policies",
            });
        }
    },
);

export interface SavePrivacyPolicyData {
    language: string;
    content: string;
}

/**
 * Save a privacy policy (creates a new version)
 */
export const savePrivacyPolicy = protectedAction(
    async (session, data: SavePrivacyPolicyData): Promise<ActionResult<PrivacyPolicy>> => {
        try {
            if (!data.language?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Language is required",
                });
            }

            if (!data.content?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Content is required",
                });
            }

            const [newPolicy] = await db
                .insert(privacyPolicies)
                .values({
                    language: data.language.trim(),
                    content: data.content.trim(),
                    created_by: session.user?.githubUsername ?? null,
                })
                .returning();

            // Revalidate the public privacy page
            revalidatePath("/privacy", "page");
            revalidateSettingsPage();

            return success(newPolicy);
        } catch (error) {
            logError("Error saving privacy policy", error);
            return failure({
                code: "SAVE_FAILED",
                message: "Failed to save privacy policy",
            });
        }
    },
);

// ============================================================================
// No-Show Follow-up Settings Actions
// ============================================================================

export interface NoShowFollowupSettings {
    enabled: boolean;
    consecutiveThreshold: number | null;
    totalThreshold: number | null;
}

/**
 * Get the current no-show follow-up settings.
 */
export const getNoShowFollowupSettings = protectedAction(
    async (): Promise<ActionResult<NoShowFollowupSettings>> => {
        try {
            const settings = await db
                .select()
                .from(globalSettings)
                .where(
                    inArray(globalSettings.key, [
                        NOSHOW_FOLLOWUP_ENABLED_KEY,
                        NOSHOW_CONSECUTIVE_THRESHOLD_KEY,
                        NOSHOW_TOTAL_THRESHOLD_KEY,
                    ]),
                );

            const settingsMap = new Map(settings.map(s => [s.key, s.value]));

            // Parse with defaults from shared constants
            const enabledValue = settingsMap.get(NOSHOW_FOLLOWUP_ENABLED_KEY);
            const enabled =
                enabledValue === null || enabledValue === undefined
                    ? true
                    : enabledValue === "true";

            const consecutiveValue = settingsMap.get(NOSHOW_CONSECUTIVE_THRESHOLD_KEY);
            const consecutiveThreshold = consecutiveValue
                ? parseInt(consecutiveValue, 10)
                : NOSHOW_CONSECUTIVE_DEFAULT;

            const totalValue = settingsMap.get(NOSHOW_TOTAL_THRESHOLD_KEY);
            const totalThreshold = totalValue ? parseInt(totalValue, 10) : NOSHOW_TOTAL_DEFAULT;

            return success({
                enabled,
                consecutiveThreshold: isNaN(consecutiveThreshold)
                    ? NOSHOW_CONSECUTIVE_DEFAULT
                    : consecutiveThreshold,
                totalThreshold: isNaN(totalThreshold) ? NOSHOW_TOTAL_DEFAULT : totalThreshold,
            });
        } catch (error) {
            logError("Error fetching no-show follow-up settings", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch no-show follow-up settings",
            });
        }
    },
);

export interface UpdateNoShowFollowupData {
    enabled: boolean;
    consecutiveThreshold: number | null;
    totalThreshold: number | null;
}

/**
 * Update no-show follow-up settings.
 */
export const updateNoShowFollowupSettings = protectedAction(
    async (
        session,
        data: UpdateNoShowFollowupData,
    ): Promise<ActionResult<NoShowFollowupSettings>> => {
        try {
            // Validate thresholds if provided (using shared constants)
            if (data.consecutiveThreshold !== null) {
                if (
                    !Number.isInteger(data.consecutiveThreshold) ||
                    data.consecutiveThreshold < NOSHOW_CONSECUTIVE_MIN ||
                    data.consecutiveThreshold > NOSHOW_CONSECUTIVE_MAX
                ) {
                    return failure({
                        code: "VALIDATION_ERROR_CONSECUTIVE",
                        message: "", // Error message handled via translation on client
                    });
                }
            }

            if (data.totalThreshold !== null) {
                if (
                    !Number.isInteger(data.totalThreshold) ||
                    data.totalThreshold < NOSHOW_TOTAL_MIN ||
                    data.totalThreshold > NOSHOW_TOTAL_MAX
                ) {
                    return failure({
                        code: "VALIDATION_ERROR_TOTAL",
                        message: "", // Error message handled via translation on client
                    });
                }
            }

            const updatedBy = session.user?.githubUsername ?? null;
            const now = new Date();

            // Upsert all settings atomically in a transaction
            const settingsToUpdate = [
                { key: NOSHOW_FOLLOWUP_ENABLED_KEY, value: data.enabled.toString() },
                {
                    key: NOSHOW_CONSECUTIVE_THRESHOLD_KEY,
                    value: data.consecutiveThreshold?.toString() ?? null,
                },
                {
                    key: NOSHOW_TOTAL_THRESHOLD_KEY,
                    value: data.totalThreshold?.toString() ?? null,
                },
            ];

            await db.transaction(async tx => {
                // Use ON CONFLICT DO UPDATE for atomic upserts
                await Promise.all(
                    settingsToUpdate.map(setting =>
                        tx
                            .insert(globalSettings)
                            .values({
                                id: nanoid(8),
                                key: setting.key,
                                value: setting.value,
                                updated_at: now,
                                updated_by: updatedBy,
                            })
                            .onConflictDoUpdate({
                                target: globalSettings.key,
                                set: {
                                    value: setting.value,
                                    updated_at: now,
                                    updated_by: updatedBy,
                                },
                            }),
                    ),
                );
            });

            revalidateSettingsPage();

            return success({
                enabled: data.enabled,
                consecutiveThreshold: data.consecutiveThreshold,
                totalThreshold: data.totalThreshold,
            });
        } catch (error) {
            logError("Error updating no-show follow-up settings", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "", // Error message handled via translation on client
            });
        }
    },
);

// ============================================================================
// User Agreement Actions (PuB - Personuppgiftsbiträdesavtal)
// ============================================================================

import { type UserAgreement, getAgreementAcceptanceCount, getCurrentAgreement, createAgreement, MAX_AGREEMENT_CONTENT_LENGTH } from "@/app/utils/user-agreement";

// Re-export UserAgreement for consumers
export type { UserAgreement };

export interface UserAgreementWithStats extends UserAgreement {
    acceptanceCount: number;
}

/**
 * Get the current (latest effective) user agreement
 */
export const getCurrentUserAgreement = protectedAction(
    async (): Promise<ActionResult<UserAgreementWithStats | null>> => {
        try {
            const agreement = await getCurrentAgreement();

            if (!agreement) {
                return success(null);
            }

            const acceptanceCount = await getAgreementAcceptanceCount(agreement.id);

            return success({
                ...agreement,
                acceptanceCount,
            });
        } catch (error) {
            logError("Error fetching current user agreement", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch user agreement",
            });
        }
    },
);

/**
 * Get all user agreement versions (for version history)
 */
export const getAllUserAgreements = protectedAction(
    async (): Promise<ActionResult<UserAgreementWithStats[]>> => {
        try {
            const agreements = await db
                .select()
                .from(userAgreements)
                .orderBy(desc(userAgreements.version));

            // Get acceptance counts for all agreements
            const agreementIds = agreements.map(a => a.id);

            if (agreementIds.length === 0) {
                return success([]);
            }

            const counts = await db
                .select({
                    agreement_id: userAgreementAcceptances.agreement_id,
                    count: sql<number>`count(*)::int`,
                })
                .from(userAgreementAcceptances)
                .where(inArray(userAgreementAcceptances.agreement_id, agreementIds))
                .groupBy(userAgreementAcceptances.agreement_id);

            const countMap = new Map(counts.map(c => [c.agreement_id, c.count]));

            return success(
                agreements.map(a => ({
                    id: a.id,
                    content: a.content,
                    version: a.version,
                    effectiveFrom: a.effective_from,
                    createdAt: a.created_at,
                    createdBy: a.created_by,
                    acceptanceCount: countMap.get(a.id) ?? 0,
                })),
            );
        } catch (error) {
            logError("Error fetching all user agreements", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch user agreements",
            });
        }
    },
);

export interface SaveUserAgreementData {
    content: string;
}

/**
 * Save a user agreement (creates a new version)
 * This will require all users to re-accept the agreement
 */
export const saveUserAgreement = protectedAction(
    async (session, data: SaveUserAgreementData): Promise<ActionResult<UserAgreement>> => {
        try {
            if (!data.content?.trim()) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: "Content is required",
                });
            }

            if (data.content.length > MAX_AGREEMENT_CONTENT_LENGTH) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: `Content exceeds maximum length of ${MAX_AGREEMENT_CONTENT_LENGTH} characters`,
                });
            }

            const newAgreement = await createAgreement(
                data.content.trim(),
                session.user?.githubUsername ?? "unknown",
            );

            revalidateSettingsPage();

            return success(newAgreement);
        } catch (error) {
            logError("Error saving user agreement", error);
            return failure({
                code: "SAVE_FAILED",
                message: "Failed to save user agreement",
            });
        }
    },
);
