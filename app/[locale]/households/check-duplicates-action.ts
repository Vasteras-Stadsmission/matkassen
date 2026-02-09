"use server";

import { db } from "@/app/db/drizzle";
import { households } from "@/app/db/schema";
import { and, isNull, sql } from "drizzle-orm";
import { protectedAgreementAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { logError } from "@/app/utils/logger";
import { normalizePhoneToE164 } from "@/app/utils/validation/phone-validation";

export interface DuplicateCheckResult {
    phoneExists: boolean;
    existingHousehold?: {
        id: string;
        first_name: string;
        last_name: string;
        phone_number: string;
    };
    similarHouseholds: Array<{
        id: string;
        first_name: string;
        last_name: string;
        phone_number: string;
        similarity: number;
    }>;
}

/**
 * Check for duplicate households by phone number and similar names
 * Used for real-time validation in household forms
 *
 * This is a separate server action file so it can be imported by client components
 */
export const checkHouseholdDuplicates = protectedAgreementAction(
    async (
        session,
        data: {
            phoneNumber?: string;
            firstName?: string;
            lastName?: string;
            excludeHouseholdId?: string; // For edit mode - exclude the household being edited
        },
    ): Promise<ActionResult<DuplicateCheckResult>> => {
        try {
            const result: DuplicateCheckResult = {
                phoneExists: false,
                similarHouseholds: [],
            };

            // Check for phone number duplicates
            if (data.phoneNumber) {
                const normalizedPhone = normalizePhoneToE164(data.phoneNumber);

                const phoneQuery = db
                    .select({
                        id: households.id,
                        first_name: households.first_name,
                        last_name: households.last_name,
                        phone_number: households.phone_number,
                    })
                    .from(households)
                    .where(
                        and(
                            sql`${households.phone_number} = ${normalizedPhone}`,
                            isNull(households.anonymized_at),
                            data.excludeHouseholdId
                                ? sql`${households.id} != ${data.excludeHouseholdId}`
                                : undefined,
                        ),
                    )
                    .limit(1);

                const [existingPhone] = await phoneQuery;

                if (existingPhone) {
                    result.phoneExists = true;
                    result.existingHousehold = existingPhone;
                }
            }

            // Check for similar names using pg_trgm similarity
            if (data.firstName && data.lastName) {
                const fullName = `${data.firstName} ${data.lastName}`;
                const SIMILARITY_THRESHOLD = 0.8;

                // Use pg_trgm similarity function (0-1 scale, where 1 is identical)
                // CTE calculates similarity once to avoid duplication in SELECT and WHERE
                const similarNamesQuery = await db.execute(sql`
                    WITH scored_households AS (
                        SELECT
                            ${households.id} as id,
                            ${households.first_name} as first_name,
                            ${households.last_name} as last_name,
                            ${households.phone_number} as phone_number,
                            similarity(
                                ${households.first_name} || ' ' || ${households.last_name},
                                ${fullName}
                            ) as similarity
                        FROM ${households}
                        WHERE ${households.anonymized_at} IS NULL
                            ${data.excludeHouseholdId ? sql`AND ${households.id} != ${data.excludeHouseholdId}` : sql``}
                    )
                    SELECT * FROM scored_households
                    WHERE similarity > ${SIMILARITY_THRESHOLD}
                    ORDER BY similarity DESC
                    LIMIT 3
                `);

                // Type assertion for the raw SQL result
                const typedResults = similarNamesQuery as unknown as Array<{
                    id: string;
                    first_name: string;
                    last_name: string;
                    phone_number: string;
                    similarity: number;
                }>;

                result.similarHouseholds = typedResults;
            }

            return success(result);
        } catch (error) {
            logError("Error checking household duplicates", error, {
                action: "checkHouseholdDuplicates",
                data,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: "Failed to check for duplicates",
            });
        }
    },
);
