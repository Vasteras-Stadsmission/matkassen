import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { pickupLocationVerificationQuestions } from "@/app/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

// PATCH /api/admin/pickup-locations/[id]/verification-questions/[questionId]
// Update a verification question
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; questionId: string }> },
) {
    try {
        // Validate authentication and organization membership
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { id, questionId } = await params;
        const body = await request.json();

        const {
            question_text_sv,
            question_text_en,
            help_text_sv,
            help_text_en,
            is_required,
            display_order,
            is_active,
        } = body;

        // Build update object with only provided fields
        const updateData: Record<string, unknown> = {
            updated_at: new Date(),
        };

        if (question_text_sv !== undefined) updateData.question_text_sv = question_text_sv;
        if (question_text_en !== undefined) updateData.question_text_en = question_text_en;
        if (help_text_sv !== undefined) updateData.help_text_sv = help_text_sv || null;
        if (help_text_en !== undefined) updateData.help_text_en = help_text_en || null;
        if (is_required !== undefined) updateData.is_required = is_required;
        if (display_order !== undefined) updateData.display_order = display_order;
        if (is_active !== undefined) updateData.is_active = is_active;

        // Update the verification question (scoped to pickup location)
        const [updatedQuestion] = await db
            .update(pickupLocationVerificationQuestions)
            .set(updateData)
            .where(
                and(
                    eq(pickupLocationVerificationQuestions.id, questionId),
                    eq(pickupLocationVerificationQuestions.pickup_location_id, id),
                ),
            )
            .returning();

        if (!updatedQuestion) {
            return NextResponse.json({ error: "Question not found" }, { status: 404 });
        }

        return NextResponse.json(updatedQuestion);
    } catch (error) {
        console.error("Error updating verification question:", error);
        return NextResponse.json(
            { error: "Failed to update verification question" },
            { status: 500 },
        );
    }
}

// DELETE /api/admin/pickup-locations/[id]/verification-questions/[questionId]
// Delete a verification question (soft delete by setting is_active = false)
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string; questionId: string }> },
) {
    try {
        // Validate authentication and organization membership
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { id, questionId } = await params;

        // Soft delete by setting is_active to false (scoped to pickup location)
        const [deletedQuestion] = await db
            .update(pickupLocationVerificationQuestions)
            .set({ is_active: false, updated_at: new Date() })
            .where(
                and(
                    eq(pickupLocationVerificationQuestions.id, questionId),
                    eq(pickupLocationVerificationQuestions.pickup_location_id, id),
                ),
            )
            .returning();

        if (!deletedQuestion) {
            return NextResponse.json({ error: "Question not found" }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error deleting verification question:", error);
        return NextResponse.json(
            { error: "Failed to delete verification question" },
            { status: 500 },
        );
    }
}
