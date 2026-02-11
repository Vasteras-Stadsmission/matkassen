import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, households, globalSettings } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { and, lt, isNull, or, sql, eq, gte, inArray } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import { Time } from "@/app/utils/time-provider";
import {
    isParcelOutsideOpeningHours,
    type ParcelTimeInfo,
} from "@/app/utils/schedule/outside-hours-filter";
import { getLocationSchedulesMap } from "@/app/utils/schedule/location-schedules-map";
import {
    NOSHOW_FOLLOWUP_ENABLED_KEY,
    NOSHOW_CONSECUTIVE_THRESHOLD_KEY,
    NOSHOW_TOTAL_THRESHOLD_KEY,
    NOSHOW_CONSECUTIVE_MIN,
    NOSHOW_CONSECUTIVE_MAX,
    NOSHOW_CONSECUTIVE_DEFAULT,
    NOSHOW_TOTAL_MIN,
    NOSHOW_TOTAL_MAX,
    NOSHOW_TOTAL_DEFAULT,
    parseThreshold,
} from "@/app/constants/noshow-settings";

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
        const todayStockholm = Time.now().toDateString(); // YYYY-MM-DD for testability
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
                    sql`(${foodParcels.pickup_date_time_latest} AT TIME ZONE 'Europe/Stockholm')::date < ${todayStockholm}::date`,
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

        // Count no-show follow-ups
        let noShowFollowupsCount = 0;

        const noshowSettings = await db
            .select()
            .from(globalSettings)
            .where(
                inArray(globalSettings.key, [
                    NOSHOW_FOLLOWUP_ENABLED_KEY,
                    NOSHOW_CONSECUTIVE_THRESHOLD_KEY,
                    NOSHOW_TOTAL_THRESHOLD_KEY,
                ]),
            );

        const settingsMap = new Map(noshowSettings.map(s => [s.key, s.value]));
        const enabledValue = settingsMap.get(NOSHOW_FOLLOWUP_ENABLED_KEY);
        const noshowEnabled =
            enabledValue === null || enabledValue === undefined ? true : enabledValue === "true";

        if (noshowEnabled) {
            const consecutiveThreshold = parseThreshold(
                settingsMap.get(NOSHOW_CONSECUTIVE_THRESHOLD_KEY),
                NOSHOW_CONSECUTIVE_DEFAULT,
                NOSHOW_CONSECUTIVE_MIN,
                NOSHOW_CONSECUTIVE_MAX,
            );
            const totalThreshold = parseThreshold(
                settingsMap.get(NOSHOW_TOTAL_THRESHOLD_KEY),
                NOSHOW_TOTAL_DEFAULT,
                NOSHOW_TOTAL_MIN,
                NOSHOW_TOTAL_MAX,
            );

            type CountRow = { count: number };
            const noShowCountResult = await db.execute(sql`
                WITH no_show_stats AS (
                    SELECT
                        h.id AS household_id,
                        h.noshow_followup_dismissed_at,
                        COUNT(fp.id) FILTER (WHERE fp.no_show_at IS NOT NULL) AS total_no_shows,
                        MAX(fp.no_show_at) AS last_no_show_at,
                        (
                            SELECT COUNT(*)
                            FROM (
                                SELECT fp2.no_show_at,
                                       ROW_NUMBER() OVER (ORDER BY fp2.pickup_date_time_earliest DESC) AS rn
                                FROM food_parcels fp2
                                WHERE fp2.household_id = h.id
                                  AND fp2.deleted_at IS NULL
                                  AND (fp2.is_picked_up = true OR fp2.no_show_at IS NOT NULL)
                            ) recent_parcels
                            WHERE recent_parcels.no_show_at IS NOT NULL
                              AND recent_parcels.rn <= (
                                  SELECT COUNT(*)
                                  FROM (
                                      SELECT fp3.no_show_at
                                      FROM food_parcels fp3
                                      WHERE fp3.household_id = h.id
                                        AND fp3.deleted_at IS NULL
                                        AND (fp3.is_picked_up = true OR fp3.no_show_at IS NOT NULL)
                                      ORDER BY fp3.pickup_date_time_earliest DESC
                                  ) sub
                                  WHERE sub.no_show_at IS NOT NULL
                              )
                              AND NOT EXISTS (
                                  SELECT 1
                                  FROM (
                                      SELECT fp4.no_show_at,
                                             ROW_NUMBER() OVER (ORDER BY fp4.pickup_date_time_earliest DESC) AS rn2
                                      FROM food_parcels fp4
                                      WHERE fp4.household_id = h.id
                                        AND fp4.deleted_at IS NULL
                                        AND (fp4.is_picked_up = true OR fp4.no_show_at IS NOT NULL)
                                  ) check_parcels
                                  WHERE check_parcels.rn2 < recent_parcels.rn
                                    AND check_parcels.no_show_at IS NULL
                              )
                        ) AS consecutive_no_shows
                    FROM households h
                    INNER JOIN food_parcels fp ON fp.household_id = h.id
                    WHERE h.anonymized_at IS NULL
                      AND fp.deleted_at IS NULL
                    GROUP BY h.id, h.first_name, h.last_name, h.noshow_followup_dismissed_at
                    HAVING COUNT(fp.id) FILTER (WHERE fp.no_show_at IS NOT NULL) >= ${totalThreshold}
                       OR (
                           SELECT COUNT(*)
                           FROM (
                               SELECT fp2.no_show_at,
                                      ROW_NUMBER() OVER (ORDER BY fp2.pickup_date_time_earliest DESC) AS rn
                               FROM food_parcels fp2
                               WHERE fp2.household_id = h.id
                                 AND fp2.deleted_at IS NULL
                                 AND (fp2.is_picked_up = true OR fp2.no_show_at IS NOT NULL)
                           ) recent
                           WHERE recent.no_show_at IS NOT NULL
                             AND recent.rn <= ${consecutiveThreshold}
                       ) >= ${consecutiveThreshold}
                )
                SELECT COUNT(*)::int AS count
                FROM no_show_stats
                WHERE noshow_followup_dismissed_at IS NULL
                   OR last_no_show_at > noshow_followup_dismissed_at
            `);

            const rawResult = noShowCountResult as unknown as CountRow[] | { rows: CountRow[] };
            const rows: CountRow[] = Array.isArray(rawResult) ? rawResult : rawResult.rows;
            noShowFollowupsCount = rows.length > 0 ? rows[0].count : 0;
        }

        const total =
            (unresolvedCount?.count ?? 0) +
            outsideHoursCount +
            (failedSmsCount?.count ?? 0) +
            noShowFollowupsCount;

        return NextResponse.json(
            {
                total,
                unresolvedHandouts: unresolvedCount?.count ?? 0,
                outsideHours: outsideHoursCount,
                failedSms: failedSmsCount?.count ?? 0,
                noShowFollowups: noShowFollowupsCount,
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
