import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and, gte, sql, or, isNull } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";

/**
 * GET /api/admin/sms/failure-count - Get count of failed SMS for navigation badge
 *
 * Counts both:
 * - Internal failures: status = 'failed' (API call to HelloSMS failed)
 * - Provider failures: status = 'sent' AND provider_status IN ('failed', 'not delivered')
 *
 * Only counts non-dismissed failures for upcoming parcels.
 */
export async function GET() {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Query for failed SMS count - includes both internal and provider failures
        const result = await db
            .select({
                count: sql<number>`count(*)::int`,
            })
            .from(outgoingSms)
            .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
            .where(
                and(
                    notDeleted(), // Only active parcels
                    gte(foodParcels.pickup_date_time_latest, new Date()), // Upcoming only
                    isNull(outgoingSms.dismissed_at), // Only non-dismissed failures
                    // Include both internal failures AND provider failures
                    or(
                        eq(outgoingSms.status, "failed"), // Internal API failure
                        and(
                            eq(outgoingSms.status, "sent"), // Sent but provider failed
                            or(
                                eq(outgoingSms.provider_status, "failed"),
                                eq(outgoingSms.provider_status, "not delivered"),
                            ),
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
