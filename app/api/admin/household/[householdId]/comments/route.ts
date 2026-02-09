import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { householdComments } from "@/app/db/schema";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import { HOUSEHOLD_ID_REGEX } from "@/app/constants/noshow-settings";

interface AddCommentRequest {
    comment: string;
}

// POST /api/admin/household/[householdId]/comments - Add comment to household
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ householdId: string }> },
) {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { householdId } = await params;

        if (!HOUSEHOLD_ID_REGEX.test(householdId)) {
            return NextResponse.json({ error: "Invalid household ID" }, { status: 400 });
        }

        const body: AddCommentRequest = await request.json();

        if (!body.comment || !body.comment.trim()) {
            return NextResponse.json({ error: "Comment is required" }, { status: 400 });
        }

        if (body.comment.trim().length > 5000) {
            return NextResponse.json({ error: "Comment too long" }, { status: 400 });
        }

        // Insert the comment
        const result = await db
            .insert(householdComments)
            .values({
                household_id: householdId,
                author_github_username: authResult.session!.user.githubUsername,
                comment: body.comment.trim(),
            })
            .returning({
                id: householdComments.id,
                comment: householdComments.comment,
                author: householdComments.author_github_username,
                createdAt: householdComments.created_at,
            });

        if (result.length === 0) {
            logError(
                "Failed to create comment - insert returned no results",
                new Error("Insert failed"),
                {
                    method: "POST",
                    path: "/api/admin/household/[householdId]/comments",
                    householdId,
                },
            );
            return NextResponse.json({ error: "Failed to create comment" }, { status: 500 });
        }

        const newComment = result[0];

        return NextResponse.json({
            success: true,
            comment: {
                id: newComment.id,
                comment: newComment.comment,
                author: newComment.author,
                createdAt: newComment.createdAt.toISOString(),
            },
        });
    } catch (error) {
        logError("Error adding comment", error, {
            method: "POST",
            path: "/api/admin/household/[householdId]/comments",
        });
        return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
    }
}
