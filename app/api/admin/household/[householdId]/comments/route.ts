import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { householdComments } from "@/app/db/schema";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

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
        const body: AddCommentRequest = await request.json();

        if (!body.comment || !body.comment.trim()) {
            return NextResponse.json({ error: "Comment is required" }, { status: 400 });
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
        console.error("Error adding comment:", error);
        return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
    }
}
