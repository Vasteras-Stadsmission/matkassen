import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { outgoingSms } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logger, logError } from "@/app/utils/logger";

// nanoid default alphabet: A-Za-z0-9_-
// Standard length is 21 chars, but we allow some flexibility
const NANOID_PATTERN = /^[A-Za-z0-9_-]{10,30}$/;

function isValidSmsId(id: string): boolean {
    return NANOID_PATTERN.test(id);
}

/**
 * PATCH /api/admin/sms/[smsId]/dismiss - Dismiss or restore an SMS failure
 *
 * Body:
 * - dismissed: boolean - true to dismiss, false to restore
 *
 * When dismissed:
 * - Sets dismissed_at to current timestamp
 * - Sets dismissed_by_user_id to admin's GitHub username
 *
 * When restored:
 * - Clears dismissed_at and dismissed_by_user_id
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ smsId: string }> },
) {
    // Capture smsId early to avoid awaiting params in catch block
    let smsId: string | undefined;

    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        smsId = (await params).smsId;

        // Validate smsId format to avoid unnecessary DB queries
        if (!isValidSmsId(smsId)) {
            return NextResponse.json({ error: "Invalid SMS ID format" }, { status: 400 });
        }

        // Ensure username is available for audit trail
        const username = authResult.session?.user?.githubUsername;
        if (!username) {
            logError("Missing githubUsername in session", new Error("No username"), {
                method: "PATCH",
                path: "/api/admin/sms/[smsId]/dismiss",
                smsId,
            });
            return NextResponse.json({ error: "Session error" }, { status: 500 });
        }

        // Parse and validate request body
        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        if (typeof body !== "object" || body === null || !("dismissed" in body)) {
            return NextResponse.json(
                { error: "Missing required field: dismissed" },
                { status: 400 },
            );
        }

        const { dismissed } = body as { dismissed: unknown };
        if (typeof dismissed !== "boolean") {
            return NextResponse.json(
                { error: "Field 'dismissed' must be a boolean" },
                { status: 400 },
            );
        }

        // Single atomic update with RETURNING to avoid TOCTOU race condition
        const now = new Date();
        const [updated] = await db
            .update(outgoingSms)
            .set(
                dismissed
                    ? {
                          dismissed_at: now,
                          dismissed_by_user_id: username,
                      }
                    : {
                          dismissed_at: null,
                          dismissed_by_user_id: null,
                      },
            )
            .where(eq(outgoingSms.id, smsId))
            .returning({ id: outgoingSms.id });

        if (!updated) {
            return NextResponse.json(
                { error: "SMS record not found", code: "NOT_FOUND" },
                { status: 404 },
            );
        }

        // Audit log
        logger.info(
            {
                smsId,
                dismissed,
                triggeredBy: username,
            },
            dismissed ? "SMS failure dismissed" : "SMS failure restored",
        );

        return NextResponse.json({
            success: true,
            smsId,
            dismissed,
            dismissedAt: dismissed ? now.toISOString() : null,
            dismissedByUserId: dismissed ? username : null,
        });
    } catch (error) {
        logError("Error updating SMS dismiss status", error, {
            method: "PATCH",
            path: "/api/admin/sms/[smsId]/dismiss",
            smsId: smsId ?? "unknown",
        });
        return NextResponse.json({ error: "Failed to update dismiss status" }, { status: 500 });
    }
}
