import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { noshowFollowupDismissals, households, nanoid } from "@/app/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import { Time } from "@/app/utils/time-provider";

// PATCH /api/admin/noshow-followup/[householdId]/dismiss - Dismiss a no-show follow-up
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ householdId: string }> },
) {
    const { householdId } = await params;

    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Check if household exists and is not anonymized
        const [household] = await db
            .select({ id: households.id })
            .from(households)
            .where(and(eq(households.id, householdId), isNull(households.anonymized_at)))
            .limit(1);

        if (!household) {
            return NextResponse.json(
                { error: "Household not found or has been removed", code: "NOT_FOUND" },
                { status: 404 },
            );
        }

        const now = Time.now().toUTC();
        const dismissedBy = authResult.session!.user.githubUsername;

        // Upsert dismissal record
        const [existingDismissal] = await db
            .select()
            .from(noshowFollowupDismissals)
            .where(eq(noshowFollowupDismissals.household_id, householdId))
            .limit(1);

        if (existingDismissal) {
            // Update existing dismissal
            await db
                .update(noshowFollowupDismissals)
                .set({
                    dismissed_at: now,
                    dismissed_by_user_id: dismissedBy,
                })
                .where(eq(noshowFollowupDismissals.household_id, householdId));
        } else {
            // Insert new dismissal
            await db.insert(noshowFollowupDismissals).values({
                id: nanoid(8),
                household_id: householdId,
                dismissed_at: now,
                dismissed_by_user_id: dismissedBy,
            });
        }

        return NextResponse.json({
            success: true,
            dismissedAt: now.toISOString(),
            dismissedBy,
            message: "No-show follow-up dismissed",
        });
    } catch (error) {
        logError("Error dismissing no-show follow-up", error, {
            method: "PATCH",
            path: "/api/admin/noshow-followup/[householdId]/dismiss",
            householdId,
        });
        return NextResponse.json(
            { error: "Failed to dismiss no-show follow-up" },
            { status: 500 },
        );
    }
}
