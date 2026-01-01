import { NextRequest, NextResponse } from "next/server";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { softDeleteParcel } from "@/app/[locale]/parcels/actions";
import { logError } from "@/app/utils/logger";

/**
 * DELETE /api/admin/parcel/[parcelId] - Soft delete a parcel
 *
 * Phase 5: DELETE API Endpoint
 *
 * CRITICAL VALIDATIONS:
 * 1. Authentication required
 * 2. Parcel must exist and not already deleted
 * 3. Parcel must be in future (not already happened)
 * 4. Parcel must not be picked up (cannot delete completed parcels)
 *
 * SMS HANDLING:
 * - If SMS is queued/sending: silently cancelled
 * - If SMS was sent: sends cancellation notification
 * - Returns SMS status in response
 */
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

        // Validate parcelId format (nanoid - typically 12-14 characters, alphanumeric with _ and -)
        const isValid =
            parcelId?.length >= 8 && parcelId?.length <= 32 && /^[a-zA-Z0-9_-]+$/.test(parcelId);

        if (!isValid) {
            return NextResponse.json({ error: "Invalid parcel ID format" }, { status: 400 });
        }

        // Attempt soft delete (session is handled by protectedAction wrapper)
        const result = await softDeleteParcel(parcelId);

        if (!result.success) {
            // Map error codes to HTTP status codes
            const statusCode =
                result.error?.code === "NOT_FOUND"
                    ? 404
                    : result.error?.code === "ALREADY_DELETED"
                      ? 410
                      : result.error?.code === "ALREADY_PICKED_UP"
                        ? 409
                        : result.error?.code === "PAST_PARCEL"
                          ? 400
                          : 500;

            return NextResponse.json(
                {
                    error: result.error?.message || "Failed to delete parcel",
                    code: result.error?.code,
                },
                { status: statusCode },
            );
        }

        // Success response with SMS status
        return NextResponse.json(
            {
                success: true,
                parcelId: result.data.parcelId,
                smsCancelled: result.data.smsCancelled,
                smsSent: result.data.smsSent,
            },
            { status: 200 },
        );
    } catch (error) {
        logError("Error in DELETE /api/admin/parcel/[parcelId]", error, {
            method: "DELETE",
            path: "/api/admin/parcel/[parcelId]",
            parcelId: (await params).parcelId,
        });
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
