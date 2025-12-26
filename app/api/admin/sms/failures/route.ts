import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, households } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and, gte, asc } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";

// GET /api/admin/sms/failures - Get list of failed SMS for upcoming parcels
export async function GET() {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Query for failed SMS - same scope as failure-count for consistency
        // Limited to 100 to prevent unbounded responses
        const failures = await db
            .select({
                id: outgoingSms.id,
                householdId: foodParcels.household_id,
                householdFirstName: households.first_name,
                householdLastName: households.last_name,
                parcelId: outgoingSms.parcel_id,
                pickupDateEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateLatest: foodParcels.pickup_date_time_latest,
                errorMessage: outgoingSms.last_error_message,
            })
            .from(outgoingSms)
            .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .where(
                and(
                    notDeleted(), // Only active parcels
                    gte(foodParcels.pickup_date_time_latest, new Date()), // Upcoming only
                    eq(outgoingSms.status, "failed"), // Failed status only
                ),
            )
            .orderBy(asc(foodParcels.pickup_date_time_earliest)) // Soonest pickups first
            .limit(100);

        return NextResponse.json(
            { failures },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            },
        );
    } catch (error) {
        logError("Error fetching SMS failures", error, {
            method: "GET",
            path: "/api/admin/sms/failures",
        });
        return NextResponse.json({ error: "Failed to fetch failures" }, { status: 500 });
    }
}
