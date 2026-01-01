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
        const nowIso = now.toISOString(); // Convert to ISO string for SQL compatibility

        // Update the parcel - only if:
        // - Not deleted
        // - Not already picked up
        // - Pickup date is today or in the past (Stockholm timezone)
        // The CHECK constraint will prevent setting no_show_at if is_picked_up is true
        const result = await db
            .update(foodParcels)
            .set({
                no_show_at: now,
                no_show_by_user_id: authResult.session!.user.githubUsername,
            })
            .where(
                and(
                    eq(foodParcels.id, parcelId),
                    eq(foodParcels.is_picked_up, false), // Can't mark as no-show if already picked up
                    notDeleted(), // Can't mark deleted parcels as no-show
                    // Pickup date must be today or in the past (Stockholm timezone)
                    sql`(${foodParcels.pickup_date_time_earliest} AT TIME ZONE 'Europe/Stockholm')::date <= (${nowIso}::timestamptz AT TIME ZONE 'Europe/Stockholm')::date`,
                ),
            )
            .returning({ id: foodParcels.id });

        if (result.length === 0) {
            return NextResponse.json(
                { error: "Parcel not found, already picked up, or pickup date is in the future" },
                { status: 404 },
            );
        }

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
