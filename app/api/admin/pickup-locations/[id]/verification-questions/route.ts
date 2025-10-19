import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { pickupLocationVerificationQuestions } from "@/app/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

// GET /api/admin/pickup-locations/[id]/verification-questions
// Fetch all verification questions for a pickup location
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        // Validate authentication and organization membership
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { id: pickupLocationId } = await params;

        // Fetch all active verification questions for this location, ordered by display_order
        const questions = await db
            .select()
            .from(pickupLocationVerificationQuestions)
            .where(
                and(
                    eq(pickupLocationVerificationQuestions.pickup_location_id, pickupLocationId),
                    eq(pickupLocationVerificationQuestions.is_active, true),
                ),
            )
            .orderBy(asc(pickupLocationVerificationQuestions.display_order));

        return NextResponse.json(questions);
    } catch (error) {
        console.error("Error fetching verification questions:", error);
        return NextResponse.json(
            { error: "Failed to fetch verification questions" },
            { status: 500 },
        );
    }
}

// POST /api/admin/pickup-locations/[id]/verification-questions
// Create a new verification question
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        // Validate authentication and organization membership
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { id: pickupLocationId } = await params;
        const body = await request.json();

        const {
            question_text_sv,
            question_text_en,
            help_text_sv,
            help_text_en,
            is_required = true,
            display_order = 0,
        } = body;

        // Validate required fields
        if (!question_text_sv || !question_text_en) {
            return NextResponse.json(
                { error: "Swedish and English question text are required" },
                { status: 400 },
            );
        }

        // Insert new verification question
        const [newQuestion] = await db
            .insert(pickupLocationVerificationQuestions)
            .values({
                pickup_location_id: pickupLocationId,
                question_text_sv,
                question_text_en,
                help_text_sv: help_text_sv || null,
                help_text_en: help_text_en || null,
                is_required,
                display_order,
                is_active: true,
            })
            .returning();

        return NextResponse.json(newQuestion, { status: 201 });
    } catch (error) {
        console.error("Error creating verification question:", error);
        return NextResponse.json(
            { error: "Failed to create verification question" },
            { status: 500 },
        );
    }
}
