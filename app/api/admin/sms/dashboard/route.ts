import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, households, pickupLocations, outgoingSms } from "@/app/db/schema";
import { notDeleted, isDeleted } from "@/app/db/query-helpers";
import { eq, and, gte } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

export interface SmsDashboardRecord {
    id: string;
    intent: string;
    status: string;
    nextAttemptAt: string | null;
    lastErrorMessage: string | null;
    createdAt: string;
    parcelId: string;
    pickupDateTimeEarliest: string;
    pickupDateTimeLatest: string;
    householdId: string;
    householdFirstName: string;
    householdLastName: string;
    locationId: string;
    locationName: string;
    locationAddress: string;
}

// GET /api/admin/sms/dashboard - Get all upcoming SMS with optional filters
export async function GET(request: NextRequest) {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Parse query parameters
        const searchParams = request.nextUrl.searchParams;
        const locationId = searchParams.get("location");
        const status = searchParams.get("status");
        const searchQuery = searchParams.get("search");
        const showCancelled = searchParams.get("cancelled") === "true";

        // Build where conditions
        // Two mutually exclusive views:
        // - Default (showCancelled=false): Active parcels only (operational view)
        // - Cancelled (showCancelled=true): Soft-deleted parcels only (audit/cancellation view)
        const conditions = [
            showCancelled ? isDeleted() : notDeleted(),
            gte(foodParcels.pickup_date_time_latest, new Date()), // Upcoming only - use latest to keep parcels visible until pickup window ends
        ];

        // Add location filter if provided
        if (locationId) {
            conditions.push(eq(pickupLocations.id, locationId));
        }

        // Add status filter if provided
        if (status) {
            conditions.push(
                eq(
                    outgoingSms.status,
                    status as "queued" | "sending" | "sent" | "retrying" | "failed" | "cancelled",
                ),
            );
        }

        // Build query
        const query = db
            .select({
                id: outgoingSms.id,
                intent: outgoingSms.intent,
                status: outgoingSms.status,
                nextAttemptAt: outgoingSms.next_attempt_at,
                lastErrorMessage: outgoingSms.last_error_message,
                createdAt: outgoingSms.created_at,
                parcelId: foodParcels.id,
                pickupDateTimeEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateTimeLatest: foodParcels.pickup_date_time_latest,
                householdId: households.id,
                householdFirstName: households.first_name,
                householdLastName: households.last_name,
                locationId: pickupLocations.id,
                locationName: pickupLocations.name,
                locationAddress: pickupLocations.street_address,
            })
            .from(outgoingSms)
            .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
            .where(and(...conditions))
            .orderBy(foodParcels.pickup_date_time_earliest, households.last_name);

        let results = await query;

        // Apply search filter if provided (case-insensitive search on name)
        if (searchQuery) {
            const lowerSearch = searchQuery.toLowerCase();
            results = results.filter(
                record =>
                    record.householdFirstName.toLowerCase().includes(lowerSearch) ||
                    record.householdLastName.toLowerCase().includes(lowerSearch),
            );
        }

        return NextResponse.json(results);
    } catch (error) {
        console.error("Error fetching SMS dashboard data:", error);
        return NextResponse.json({ error: "Failed to fetch SMS dashboard data" }, { status: 500 });
    }
}
