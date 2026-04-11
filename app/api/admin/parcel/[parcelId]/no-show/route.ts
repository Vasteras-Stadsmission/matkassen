import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import {
    markNoShow,
    undoNoShow,
    type ParcelTransitionError,
} from "@/app/utils/parcels/state-transitions";

/**
 * Map a state-transition error code to the HTTP status the no-show
 * routes have always returned. Centralised so PATCH and DELETE stay
 * consistent and the mapping is easy to audit.
 */
function noShowErrorStatus(code: ParcelTransitionError["code"]): number {
    switch (code) {
        case "NOT_FOUND":
            return 404;
        case "ALREADY_DELETED":
        case "ALREADY_PICKED_UP":
        case "ALREADY_NO_SHOW":
        case "FUTURE_PARCEL":
            return 400;
        default:
            return 500;
    }
}

// PATCH /api/admin/parcel/[parcelId]/no-show - Mark parcel as no-show
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    const { parcelId } = await params;

    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest(undefined, { adminOnly: false });
        if (!authResult.success) {
            return authResult.response;
        }

        const result = await db.transaction(async tx =>
            markNoShow(tx, { parcelId, session: authResult.session }),
        );

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error.message, code: result.error.code },
                { status: noShowErrorStatus(result.error.code) },
            );
        }

        return NextResponse.json({
            success: true,
            noShowBy: authResult.session.user.githubUsername,
            message: "Parcel marked as no-show",
        });
    } catch (error) {
        logError("Error marking parcel as no-show", error, {
            method: "PATCH",
            path: "/api/admin/parcel/[parcelId]/no-show",
            parcelId,
        });
        return NextResponse.json({ error: "Failed to mark parcel as no-show" }, { status: 500 });
    }
}

// DELETE /api/admin/parcel/[parcelId]/no-show - Undo no-show marking
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    const { parcelId } = await params;

    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest(undefined, { adminOnly: false });
        if (!authResult.success) {
            return authResult.response;
        }

        const result = await db.transaction(async tx =>
            undoNoShow(tx, { parcelId, session: authResult.session }),
        );

        if (!result.ok) {
            return NextResponse.json(
                { error: result.error.message },
                { status: noShowErrorStatus(result.error.code) },
            );
        }

        return NextResponse.json({
            success: true,
            message: "Parcel no-show status cleared",
        });
    } catch (error) {
        logError("Error clearing parcel no-show status", error, {
            method: "DELETE",
            path: "/api/admin/parcel/[parcelId]/no-show",
            parcelId,
        });
        return NextResponse.json(
            { error: "Failed to clear parcel no-show status" },
            { status: 500 },
        );
    }
}
