import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";

// PATCH /api/admin/parcel/[parcelId]/pickup - Mark parcel as picked up
export async function PATCH(request: NextRequest, { params }: { params: { parcelId: string } }) {
    try {
        // Validate session and get user info for audit trail
        const session = await auth();
        if (!session?.user?.name) {
            return NextResponse.json({ error: "Session not found" }, { status: 401 });
        }

        const { parcelId } = params;
        const now = new Date();

        // Update the parcel
        const result = await db
            .update(foodParcels)
            .set({
                is_picked_up: true,
                picked_up_at: now,
                picked_up_by_user_id: session.user.name, // GitHub username
            })
            .where(eq(foodParcels.id, parcelId))
            .returning({ id: foodParcels.id });

        if (result.length === 0) {
            return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            pickedUpAt: now.toISOString(),
            pickedUpBy: session.user.name,
            message: "Parcel marked as picked up",
        });
    } catch (error) {
        console.error("Error marking parcel as picked up:", error);
        return NextResponse.json({ error: "Failed to mark parcel as picked up" }, { status: 500 });
    }
}
