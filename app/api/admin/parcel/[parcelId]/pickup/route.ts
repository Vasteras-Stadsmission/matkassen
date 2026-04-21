import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import { markPickedUp, undoPickup } from "@/app/utils/parcels/state-transitions";

// PATCH /api/admin/parcel/[parcelId]/pickup - Mark parcel as picked up
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest(undefined, { adminOnly: false });
        if (!authResult.success) {
            return authResult.response;
        }

        const { parcelId } = await params;

        const result = await db.transaction(async tx =>
            markPickedUp(tx, { parcelId, session: authResult.session }),
        );

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error.message, code: result.error.code },
                { status: 404 },
            );
        }

        return NextResponse.json({
            success: true,
            pickedUpBy: authResult.session.user.githubUsername,
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
        const authResult = await authenticateAdminRequest(undefined, { adminOnly: false });
        if (!authResult.success) {
            return authResult.response;
        }

        const { parcelId } = await params;

        const result = await db.transaction(async tx =>
            undoPickup(tx, { parcelId, session: authResult.session }),
        );

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error.message, code: result.error.code },
                { status: 404 },
            );
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
