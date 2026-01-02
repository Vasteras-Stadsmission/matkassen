import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and, sql } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import { Time } from "@/app/utils/time-provider";

// PATCH /api/admin/parcel/[parcelId]/no-show - Mark parcel as no-show
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    const { parcelId } = await params;

    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const now = Time.now().toUTC();
        const todayStockholm = Time.now().toDateString(); // YYYY-MM-DD in Stockholm timezone

        // First, fetch the parcel to check its state and provide specific error messages
        const [parcel] = await db
            .select({
                id: foodParcels.id,
                isPickedUp: foodParcels.is_picked_up,
                deletedAt: foodParcels.deleted_at,
                noShowAt: foodParcels.no_show_at,
                pickupDateTimeEarliest: foodParcels.pickup_date_time_earliest,
            })
            .from(foodParcels)
            .where(eq(foodParcels.id, parcelId))
            .limit(1);

        if (!parcel) {
            return NextResponse.json(
                { error: "Parcel not found", code: "NOT_FOUND" },
                { status: 404 },
            );
        }

        if (parcel.deletedAt) {
            return NextResponse.json(
                { error: "Cannot mark a cancelled parcel as no-show", code: "ALREADY_CANCELLED" },
                { status: 400 },
            );
        }

        if (parcel.isPickedUp) {
            return NextResponse.json(
                { error: "Cannot mark a picked up parcel as no-show", code: "ALREADY_PICKED_UP" },
                { status: 400 },
            );
        }

        if (parcel.noShowAt) {
            return NextResponse.json(
                { error: "Parcel is already marked as no-show", code: "ALREADY_NO_SHOW" },
                { status: 400 },
            );
        }

        // Only block future parcels - same-day no-show is intentionally allowed.
        // Users may receive late "I won't come" notifications on pickup day itself,
        // and staff need to be able to record these as no-shows immediately.
        const pickupDateStockholm = Time.fromDate(parcel.pickupDateTimeEarliest).toDateString();
        if (pickupDateStockholm > todayStockholm) {
            return NextResponse.json(
                { error: "Cannot mark future parcel as no-show", code: "FUTURE_PARCEL" },
                { status: 400 },
            );
        }

        // Now update the parcel
        await db
            .update(foodParcels)
            .set({
                no_show_at: now,
                no_show_by_user_id: authResult.session!.user.githubUsername,
            })
            .where(eq(foodParcels.id, parcelId));

        return NextResponse.json({
            success: true,
            noShowAt: now.toISOString(),
            noShowBy: authResult.session!.user.githubUsername,
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
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Update the parcel to clear no-show status - only if:
        // - Not deleted
        // - Currently marked as no-show
        const result = await db
            .update(foodParcels)
            .set({
                no_show_at: null,
                no_show_by_user_id: null,
            })
            .where(
                and(
                    eq(foodParcels.id, parcelId),
                    notDeleted(),
                    sql`${foodParcels.no_show_at} IS NOT NULL`,
                ),
            )
            .returning({ id: foodParcels.id });

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Parcel not found, deleted, or not marked as no-show" },
                { status: 404 },
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
