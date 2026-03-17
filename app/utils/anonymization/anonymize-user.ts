/**
 * Anonymize user personal data for users deactivated longer than the retention period.
 * GDPR compliance: personal data is scrubbed 12 months after deactivation.
 * The user record is kept (for audit log integrity) but personal fields are cleared.
 */

import { db } from "@/app/db/drizzle";
import { users } from "@/app/db/schema";
import { and, eq, isNotNull, lte, sql } from "drizzle-orm";
import { logger, logError } from "@/app/utils/logger";

const RETENTION_MONTHS = 12;

export async function anonymizeDeactivatedUsers(): Promise<{
    anonymized: number;
    errors: string[];
}> {
    const errors: string[] = [];
    let anonymized = 0;

    try {
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);

        // Find users deactivated longer than the retention period
        // who still have personal data (first_name is used as the indicator)
        const eligibleUsers = await db
            .select({
                id: users.id,
                github_username: users.github_username,
            })
            .from(users)
            .where(
                and(
                    isNotNull(users.deactivated_at),
                    lte(users.deactivated_at, cutoffDate),
                    // Only anonymize users who still have personal data
                    sql`(${users.first_name} IS NOT NULL OR ${users.last_name} IS NOT NULL OR ${users.email} IS NOT NULL OR ${users.phone} IS NOT NULL OR ${users.display_name} IS NOT NULL OR ${users.avatar_url} IS NOT NULL)`,
                ),
            );

        if (eligibleUsers.length === 0) {
            return { anonymized: 0, errors: [] };
        }

        logger.info(
            { count: eligibleUsers.length, cutoffDate: cutoffDate.toISOString() },
            "Anonymizing deactivated users past retention period",
        );

        for (const user of eligibleUsers) {
            try {
                const updated = await db
                    .update(users)
                    .set({
                        first_name: null,
                        last_name: null,
                        email: null,
                        phone: null,
                        display_name: null,
                        avatar_url: null,
                    })
                    .where(
                        and(
                            eq(users.id, user.id),
                            isNotNull(users.deactivated_at),
                            lte(users.deactivated_at, cutoffDate),
                        ),
                    )
                    .returning({ id: users.id });

                if (updated.length > 0) {
                    anonymized++;
                    logger.info(
                        { userId: user.id },
                        "User personal data anonymized (GDPR retention expired)",
                    );
                } else {
                    logger.info(
                        { userId: user.id },
                        "User anonymization skipped (no longer eligible)",
                    );
                }
            } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                errors.push(`${user.id}: ${errMsg}`);
                logError("Failed to anonymize user", err, { userId: user.id });
            }
        }

        return { anonymized, errors };
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        logError("Failed to run user anonymization", error);
        errors.push(errMsg);
        return { anonymized, errors };
    }
}
