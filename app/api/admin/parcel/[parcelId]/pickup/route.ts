import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";

// PATCH /api/admin/parcel/[parcelId]/pickup - Mark parcel as picked up
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { parcelId } = await params;
        const now = new Date();

        // Update the parcel
        const result = await db
            .update(foodParcels)
            .set({
                is_picked_up: true,
                picked_up_at: now,
                picked_up_by_user_id: authResult.session!.user.githubUsername, // GitHub username
            })
            .where(eq(foodParcels.id, parcelId))
            .returning({ id: foodParcels.id });

        if (result.length === 0) {
            return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            pickedUpAt: now.toISOString(),
            pickedUpBy: authResult.session!.user.githubUsername,
            message: "Parcel marked as picked up",
        });
    } catch (error) {
        logError("Error marking parcel as picked up", error, {
            method: "PATCH",
            path: "/api/admin/parcel/[parcelId]/pickup",
            parcelId: (await params).parcelId,
        });
        return NextResponse.json({ error: "Failed to mark parcel as picked up" }, { status: 500 });
    }
}

// DELETE /api/admin/parcel/[parcelId]/pickup - Undo pickup marking
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { parcelId } = await params;

        // Update the parcel to clear pickup status
        const result = await db
            .update(foodParcels)
            .set({
                is_picked_up: false,
                picked_up_at: null,
                picked_up_by_user_id: null,
            })
            .where(eq(foodParcels.id, parcelId))
            .returning({ id: foodParcels.id });

        if (result.length === 0) {
            return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
        }

        return NextResponse.json({
            success: true,
            message: "Parcel pickup status cleared",
        });
    } catch (error) {
        logError("Error clearing parcel pickup status", error, {
            method: "DELETE",
            path: "/api/admin/parcel/[parcelId]/pickup",
            parcelId: (await params).parcelId,
        });
        return NextResponse.json(
            { error: "Failed to clear parcel pickup status" },
            { status: 500 },
        );
    }
}
