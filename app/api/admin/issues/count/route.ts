import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, households } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { and, lt, isNull, or, sql, eq, gte } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import { Time } from "@/app/utils/time-provider";
import {
    isParcelOutsideOpeningHours,
    type ParcelTimeInfo,
} from "@/app/utils/schedule/outside-hours-filter";
import { getLocationSchedulesMap } from "@/app/utils/schedule/location-schedules-map";

// 24 hours in milliseconds - threshold for stale SMS
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/admin/issues/count - Lightweight endpoint for issue counts
 * Returns only counts without full data, suitable for navigation badges
 */
export async function GET() {
    try {
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const now = Time.now().toUTC();
        const staleThreshold = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

        // Count unresolved handouts (past parcels not picked up, not no-show, not deleted)
        // Exclude anonymized households to match main issues endpoint
        const [unresolvedCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .where(
                and(
                    notDeleted(),
                    eq(foodParcels.is_picked_up, false),
                    isNull(foodParcels.no_show_at),
                    isNull(households.anonymized_at),
                    sql`(${foodParcels.pickup_date_time_latest} AT TIME ZONE 'Europe/Stockholm')::date < (NOW() AT TIME ZONE 'Europe/Stockholm')::date`,
                ),
            );

        // Count failed SMS (exclude anonymized households)
        const [failedSmsCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(outgoingSms)
            .innerJoin(households, eq(outgoingSms.household_id, households.id))
            .where(
                and(
                    isNull(outgoingSms.dismissed_at),
                    isNull(households.anonymized_at),
                    or(
                        eq(outgoingSms.status, "failed"),
                        and(
                            eq(outgoingSms.status, "sent"),
                            or(
                                eq(outgoingSms.provider_status, "failed"),
                                eq(outgoingSms.provider_status, "not delivered"),
                            ),
                        ),
                        and(
                            eq(outgoingSms.status, "sent"),
                            isNull(outgoingSms.provider_status),
                            lt(outgoingSms.sent_at, staleThreshold),
                        ),
                    ),
                ),
            );

        // Get location schedules for outside hours check
        const locationSchedulesMap = await getLocationSchedulesMap();

        // Get future parcels for outside hours check (exclude anonymized households)
        const futureParcels = await db
            .select({
                id: foodParcels.id,
                locationId: foodParcels.pickup_location_id,
                pickupEarliest: foodParcels.pickup_date_time_earliest,
                pickupLatest: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .where(
                and(
                    notDeleted(),
                    eq(foodParcels.is_picked_up, false),
                    isNull(households.anonymized_at),
                    gte(foodParcels.pickup_date_time_earliest, now), // Future only - matches main issues endpoint
                ),
            );

        // Count parcels outside opening hours
        let outsideHoursCount = 0;
        for (const parcel of futureParcels) {
            const scheduleInfo = locationSchedulesMap.get(parcel.locationId);
            if (scheduleInfo && scheduleInfo.schedules.length > 0) {
                const parcelTimeInfo: ParcelTimeInfo = {
                    id: parcel.id,
                    pickupEarliestTime: parcel.pickupEarliest,
                    pickupLatestTime: parcel.pickupLatest,
                    isPickedUp: parcel.isPickedUp,
                };

                if (
                    isParcelOutsideOpeningHours(parcelTimeInfo, scheduleInfo, {
                        onError: "return-true",
                    })
                ) {
                    outsideHoursCount++;
                }
            }
        }

        const total =
            (unresolvedCount?.count ?? 0) + outsideHoursCount + (failedSmsCount?.count ?? 0);

        return NextResponse.json(
            {
                total,
                unresolvedHandouts: unresolvedCount?.count ?? 0,
                outsideHours: outsideHoursCount,
                failedSms: failedSmsCount?.count ?? 0,
            },
            {
                headers: {
                    "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
                },
            },
        );
    } catch (error) {
        logError("Error fetching issue counts", error, {
            method: "GET",
            path: "/api/admin/issues/count",
        });
        return NextResponse.json({ error: "Failed to fetch issue counts" }, { status: 500 });
    }
}
