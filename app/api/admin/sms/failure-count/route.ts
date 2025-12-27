import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms } from "@/app/db/schema";
import { eq, and, gte, or, isNull, sql } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";

// GET /api/admin/sms/failure-count - Get count of failed SMS for badge
export async function GET() {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // For enrolment SMS (no parcel), show failures from last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // Query for failed SMS count - includes both parcel and non-parcel (enrolment) SMS
        const result = await db
            .select({
                count: sql<number>`count(*)::int`,
            })
            .from(outgoingSms)
            .leftJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
            .where(
                and(
                    eq(outgoingSms.status, "failed"), // Failed status only
                    or(
                        // Parcel SMS: upcoming parcels only (not deleted)
                        and(
                            isNull(foodParcels.deleted_at),
                            gte(foodParcels.pickup_date_time_latest, new Date()),
                        ),
                        // Non-parcel SMS (enrolment): recent failures only
                        and(
                            isNull(outgoingSms.parcel_id),
                            gte(outgoingSms.created_at, sevenDaysAgo),
                        ),
                    ),
                ),
            );

        const failureCount = result[0]?.count || 0;

        return NextResponse.json(
            { count: failureCount },
            {
                headers: {
                    "Cache-Control": "no-store",
                },
            },
        );
    } catch (error) {
        logError("Error fetching SMS failure count", error, {
            method: "GET",
            path: "/api/admin/sms/failure-count",
        });
        return NextResponse.json({ error: "Failed to fetch failure count" }, { status: 500 });
    }
}
