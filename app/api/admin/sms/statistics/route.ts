import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, pickupLocations } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and, gte, sql } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";

export interface SmsStatisticsRecord {
    locationId: string;
    locationName: string;
    today: {
        sent: number;
        failed: number;
        pending: number;
    };
    last7Days: {
        sent: number;
        failed: number;
        total: number;
        successRate: number;
    };
    currentMonth: {
        sent: number;
        failed: number;
        total: number;
    };
    lastMonth: {
        sent: number;
        failed: number;
        total: number;
    };
}

// GET /api/admin/sms/statistics - Get SMS statistics per location
export async function GET(request: NextRequest) {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        // Parse query parameters - optional location filter
        const searchParams = request.nextUrl.searchParams;
        const locationId = searchParams.get("location");

        // Get all locations (or specific location if filtered)
        const locationConditions = locationId ? [eq(pickupLocations.id, locationId)] : [];
        const locationsData = await db
            .select({
                id: pickupLocations.id,
                name: pickupLocations.name,
            })
            .from(pickupLocations)
            .where(and(...locationConditions))
            .orderBy(pickupLocations.name);

        // Calculate date ranges
        const now = new Date();
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const sevenDaysAgo = new Date(now);
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);

        // Build statistics for each location
        const statistics: SmsStatisticsRecord[] = await Promise.all(
            locationsData.map(async location => {
                // Today's stats
                const todayStats = await db
                    .select({
                        status: outgoingSms.status,
                        count: sql<number>`count(*)`.mapWith(Number),
                    })
                    .from(outgoingSms)
                    .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
                    .where(
                        and(
                            notDeleted(),
                            eq(foodParcels.pickup_location_id, location.id),
                            gte(outgoingSms.created_at, todayStart),
                        ),
                    )
                    .groupBy(outgoingSms.status);

                // Last 7 days stats
                const sevenDaysStats = await db
                    .select({
                        status: outgoingSms.status,
                        count: sql<number>`count(*)`.mapWith(Number),
                    })
                    .from(outgoingSms)
                    .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
                    .where(
                        and(
                            notDeleted(),
                            eq(foodParcels.pickup_location_id, location.id),
                            gte(outgoingSms.created_at, sevenDaysAgo),
                        ),
                    )
                    .groupBy(outgoingSms.status);

                // Current month stats
                const currentMonthStats = await db
                    .select({
                        status: outgoingSms.status,
                        count: sql<number>`count(*)`.mapWith(Number),
                    })
                    .from(outgoingSms)
                    .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
                    .where(
                        and(
                            notDeleted(),
                            eq(foodParcels.pickup_location_id, location.id),
                            gte(outgoingSms.created_at, currentMonthStart),
                        ),
                    )
                    .groupBy(outgoingSms.status);

                // Last month stats
                const lastMonthStats = await db
                    .select({
                        status: outgoingSms.status,
                        count: sql<number>`count(*)`.mapWith(Number),
                    })
                    .from(outgoingSms)
                    .innerJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
                    .where(
                        and(
                            notDeleted(),
                            eq(foodParcels.pickup_location_id, location.id),
                            gte(outgoingSms.created_at, lastMonthStart),
                            sql`${outgoingSms.created_at} <= ${lastMonthEnd}`,
                        ),
                    )
                    .groupBy(outgoingSms.status);

                // Helper to aggregate stats
                const aggregateStats = (stats: { status: string; count: number }[]) => {
                    const sent = stats.find(s => s.status === "sent")?.count || 0;
                    const failed = stats.find(s => s.status === "failed")?.count || 0;
                    const pending =
                        (stats.find(s => s.status === "queued")?.count || 0) +
                        (stats.find(s => s.status === "sending")?.count || 0) +
                        (stats.find(s => s.status === "retrying")?.count || 0);
                    const total = stats.reduce((sum, s) => sum + s.count, 0);
                    return { sent, failed, pending, total };
                };

                const today = aggregateStats(todayStats);
                const last7Days = aggregateStats(sevenDaysStats);
                const currentMonth = aggregateStats(currentMonthStats);
                const lastMonth = aggregateStats(lastMonthStats);

                // Calculate success rate for last 7 days
                // Guard against division by zero when all messages are still pending
                const successRate =
                    last7Days.sent + last7Days.failed > 0
                        ? Math.round(
                              (last7Days.sent / (last7Days.sent + last7Days.failed)) * 1000,
                          ) / 10
                        : 100;

                return {
                    locationId: location.id,
                    locationName: location.name,
                    today: {
                        sent: today.sent,
                        failed: today.failed,
                        pending: today.pending,
                    },
                    last7Days: {
                        sent: last7Days.sent,
                        failed: last7Days.failed,
                        total: last7Days.total,
                        successRate,
                    },
                    currentMonth: {
                        sent: currentMonth.sent,
                        failed: currentMonth.failed,
                        total: currentMonth.total,
                    },
                    lastMonth: {
                        sent: lastMonth.sent,
                        failed: lastMonth.failed,
                        total: lastMonth.total,
                    },
                };
            }),
        );

        return NextResponse.json(statistics);
    } catch (error) {
        console.error("Error fetching SMS statistics:", error);
        return NextResponse.json({ error: "Failed to fetch SMS statistics" }, { status: 500 });
    }
}
