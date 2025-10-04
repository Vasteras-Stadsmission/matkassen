import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and, gte, sql } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

// GET /api/admin/sms/failure-count - Get count of failed SMS for badge
export async function GET() {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Query for failed SMS count
        const result = await db
            .select({
                count: sql<number>`count(*)::int`,
            })
            .from(outgoingSms)
            .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
            .where(
                and(
                    notDeleted(), // Only active parcels
                    gte(foodParcels.pickup_date_time_earliest, new Date()), // Upcoming only
                    eq(outgoingSms.status, "failed"), // Failed status only
                ),
            );

        const failureCount = result[0]?.count || 0;

        return NextResponse.json({ count: failureCount });
    } catch (error) {
        console.error("Error fetching SMS failure count:", error);
        return NextResponse.json({ error: "Failed to fetch failure count" }, { status: 500 });
    }
}
