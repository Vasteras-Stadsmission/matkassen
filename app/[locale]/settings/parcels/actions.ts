"use server";

import { protectedAdminAction as protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { db } from "@/app/db/drizzle";
import { globalSettings, nanoid } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { routing } from "@/app/i18n/routing";
import { logError } from "@/app/utils/logger";
import { recordAuditEvent } from "@/app/utils/audit/log";
import { auditDetailsForChanges, buildChanges } from "@/app/utils/audit/changes";

const PARCEL_WARNING_THRESHOLD_KEY = "parcel_warning_threshold";

/**
 * Revalidates settings pages for all supported locales.
 */
function revalidateSettingsPage() {
    routing.locales.forEach(locale => {
        revalidatePath(`/${locale}/settings`, "layout");
    });
}

export interface ParcelThresholdSetting {
    threshold: number | null; // null means disabled
}

/**
 * Get the current parcel warning threshold setting.
 */
export const getParcelWarningThreshold = protectedAction(
    async (): Promise<ActionResult<ParcelThresholdSetting>> => {
        try {
            const [setting] = await db
                .select()
                .from(globalSettings)
                .where(eq(globalSettings.key, PARCEL_WARNING_THRESHOLD_KEY));

            // Note: parseInt returns NaN for null/undefined, so we check isNaN
            const threshold = setting?.value ? parseInt(setting.value, 10) : null;
            return success({
                threshold: threshold !== null && isNaN(threshold) ? null : threshold,
            });
        } catch (error) {
            logError("Error fetching parcel warning threshold", error);
            return failure({
                code: "FETCH_FAILED",
                message: "Failed to fetch parcel warning threshold",
            });
        }
    },
);

/**
 * Update the parcel warning threshold setting.
 * Pass null to disable warnings.
 */
export const updateParcelWarningThreshold = protectedAction(
    async (session, threshold: number | null): Promise<ActionResult<ParcelThresholdSetting>> => {
        try {
            // Validate threshold if provided (must be >= 1)
            if (threshold !== null) {
                if (!Number.isInteger(threshold) || threshold < 1) {
                    return failure({
                        code: "VALIDATION_ERROR",
                        message: "Threshold must be a positive integer (>= 1)",
                    });
                }
            }

            const value = threshold !== null ? threshold.toString() : null;

            await db.transaction(async tx => {
                const [existingSetting] = await tx
                    .select()
                    .from(globalSettings)
                    .where(eq(globalSettings.key, PARCEL_WARNING_THRESHOLD_KEY));

                if (existingSetting) {
                    await tx
                        .update(globalSettings)
                        .set({
                            value,
                            updated_at: new Date(),
                            updated_by: session.user?.githubUsername,
                        })
                        .where(eq(globalSettings.key, PARCEL_WARNING_THRESHOLD_KEY));
                } else {
                    await tx.insert(globalSettings).values({
                        id: nanoid(8),
                        key: PARCEL_WARNING_THRESHOLD_KEY,
                        value,
                        updated_by: session.user?.githubUsername,
                    });
                }

                const changes = buildChanges({ value: existingSetting?.value ?? null }, { value });

                if (Object.keys(changes).length > 0) {
                    await recordAuditEvent(tx, {
                        session,
                        entityType: "global_setting",
                        entityId: PARCEL_WARNING_THRESHOLD_KEY,
                        action: "updated",
                        summary: "Updated parcel warning threshold",
                        details: auditDetailsForChanges(changes),
                    });
                }
            });

            revalidateSettingsPage();
            return success({ threshold });
        } catch (error) {
            logError("Error updating parcel warning threshold", error);
            return failure({
                code: "UPDATE_FAILED",
                message: "Failed to update parcel warning threshold",
            });
        }
    },
);
