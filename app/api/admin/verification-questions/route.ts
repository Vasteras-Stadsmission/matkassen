import { NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { db } from "@/app/db/drizzle";
import { verificationQuestions } from "@/app/db/schema";
import { asc, eq } from "drizzle-orm";

export async function GET() {
    const authResult = await authenticateAdminRequest();
    if (!authResult.success) {
        return authResult.response!;
    }

    try {
        // Fetch only active verification questions ordered by display_order
        const questions = await db
            .select()
            .from(verificationQuestions)
            .where(eq(verificationQuestions.is_active, true))
            .orderBy(asc(verificationQuestions.display_order));

        return NextResponse.json(questions);
    } catch (error) {
        console.error("Error fetching verification questions:", error);
        return NextResponse.json(
            { error: "Failed to fetch verification questions" },
            { status: 500 },
        );
    }
}
