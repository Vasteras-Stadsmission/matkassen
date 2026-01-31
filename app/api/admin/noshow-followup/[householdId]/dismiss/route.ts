import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { households } from "@/app/db/schema";
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

        const now = Time.now().toUTC();
        const dismissedBy = authResult.session!.user.githubUsername;

        // Update household with dismissal timestamp (atomic operation)
        const [updated] = await db
            .update(households)
            .set({
                noshow_followup_dismissed_at: now,
                noshow_followup_dismissed_by: dismissedBy,
            })
            .where(and(eq(households.id, householdId), isNull(households.anonymized_at)))
            .returning({ id: households.id });

        if (!updated) {
            return NextResponse.json(
                { error: "Household not found or has been removed", code: "NOT_FOUND" },
                { status: 404 },
            );
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
