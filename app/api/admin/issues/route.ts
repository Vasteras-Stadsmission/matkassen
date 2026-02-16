import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, outgoingSms, households, pickupLocations } from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and, gte, lt, asc, isNull, or, sql } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import { Time } from "@/app/utils/time-provider";
import {
    isParcelOutsideOpeningHours,
    type ParcelTimeInfo,
} from "@/app/utils/schedule/outside-hours-filter";
import { getLocationSchedulesMap } from "@/app/utils/schedule/location-schedules-map";
import { getNoShowFollowupConfig, queryNoShowFollowups } from "@/app/db/queries/noshow-followups";

// 24 hours in milliseconds - threshold for stale SMS
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Sanitize error messages to remove potential PII like phone numbers.
 */
function sanitizeErrorMessage(message: string | null): string | null {
    if (!message) return null;

    return message
        .replace(/\+\d{1,3}(?:[-.\s]?\d)+/g, "[PHONE REDACTED]")
        .replace(/\b07\d(?:[-.\s]?\d){6,}/g, "[PHONE REDACTED]")
        .replace(/\b\d(?:[-.\s]?\d){6,14}\b/g, "[PHONE REDACTED]");
}

/**
 * Get failure type for SMS
 */
function getFailureType(
    status: string,
    providerStatus: string | null,
    sentAt: Date | null,
    staleThreshold: Date,
): "internal" | "provider" | "stale" {
    if (status === "failed") {
        return "internal";
    }
    if (providerStatus === "failed" || providerStatus === "not delivered") {
        return "provider";
    }
    if (status === "sent" && !providerStatus && sentAt && sentAt < staleThreshold) {
        return "stale";
    }
    return "internal";
}

/**
 * GET /api/admin/issues - Get all issues for the unified Issues page
 *
 * Returns:
 * - unresolvedHandouts: parcels where pickup DATE has passed, no outcome set
 * - outsideHours: future parcels scheduled outside opening hours
 * - failedSms: ALL SMS failures (not just upcoming parcels)
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

        // Run count queries first (without limits) for accurate badge counts
        const [unresolvedHandoutsCount] = await db
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

        const [failedSmsCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(outgoingSms)
            .innerJoin(households, eq(outgoingSms.household_id, households.id))
            .where(
                and(
                    isNull(outgoingSms.dismissed_at),
                    isNull(households.anonymized_at),
                    eq(outgoingSms.balance_failure, false), // Balance failures shown in banner instead
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

        // 1. Query unresolved handouts: parcels where DATE has passed, no outcome
        // Use Stockholm timezone for date comparison
        const unresolvedHandoutsRaw = await db
            .select({
                parcelId: foodParcels.id,
                householdId: foodParcels.household_id,
                householdFirstName: households.first_name,
                householdLastName: households.last_name,
                pickupDateEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateLatest: foodParcels.pickup_date_time_latest,
                locationId: foodParcels.pickup_location_id,
                locationName: pickupLocations.name,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
            .where(
                and(
                    notDeleted(),
                    eq(foodParcels.is_picked_up, false),
                    isNull(foodParcels.no_show_at),
                    isNull(households.anonymized_at), // Exclude anonymized households
                    // Date-based check: pickup_date_time_latest's DATE < today's DATE (Stockholm)
                    sql`(${foodParcels.pickup_date_time_latest} AT TIME ZONE 'Europe/Stockholm')::date < ${todayStockholm}::date`,
                ),
            )
            .orderBy(asc(foodParcels.pickup_date_time_earliest))
            .limit(100);

        // 2. Query future parcels for outside-hours check
        const futureParcelsRaw = await db
            .select({
                parcelId: foodParcels.id,
                householdId: foodParcels.household_id,
                householdFirstName: households.first_name,
                householdLastName: households.last_name,
                pickupDateEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateLatest: foodParcels.pickup_date_time_latest,
                locationId: foodParcels.pickup_location_id,
                locationName: pickupLocations.name,
                isPickedUp: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
            .where(
                and(
                    notDeleted(),
                    eq(foodParcels.is_picked_up, false),
                    isNull(households.anonymized_at), // Exclude anonymized households
                    gte(foodParcels.pickup_date_time_earliest, now), // Future only
                ),
            )
            .orderBy(asc(foodParcels.pickup_date_time_earliest)); // No limit - need full count

        // Get location schedules for outside-hours check
        const locationSchedulesMap = await getLocationSchedulesMap();

        // Filter to only parcels outside opening hours (no limit for accurate count)
        const outsideHoursFiltered = futureParcelsRaw.filter(parcel => {
            const scheduleInfo = locationSchedulesMap.get(parcel.locationId);
            if (!scheduleInfo || scheduleInfo.schedules.length === 0) {
                // No schedule = treat as valid (don't flag as issue)
                return false;
            }

            const parcelTimeInfo: ParcelTimeInfo = {
                id: parcel.parcelId,
                pickupEarliestTime: parcel.pickupDateEarliest,
                pickupLatestTime: parcel.pickupDateLatest,
                isPickedUp: parcel.isPickedUp,
            };

            return isParcelOutsideOpeningHours(parcelTimeInfo, scheduleInfo, {
                onError: "return-true",
            });
        });

        // Get accurate count before slicing for display
        const outsideHoursCount = outsideHoursFiltered.length;

        // Slice and map for display (limit to 100 items)
        const outsideHours = outsideHoursFiltered.slice(0, 100).map(parcel => {
            // Get opening hours for the parcel's date from schedule
            const scheduleInfo = locationSchedulesMap.get(parcel.locationId);
            let locationOpeningHours: string | null = null;
            let locationIsClosed = false;

            if (scheduleInfo) {
                const parcelDate = Time.fromDate(parcel.pickupDateEarliest);
                const weekdayIndex = parcelDate.toDate().getDay();
                const weekdayNames = [
                    "sunday",
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                ];
                const weekdayName = weekdayNames[weekdayIndex];

                // Find the applicable schedule for this date
                for (const schedule of scheduleInfo.schedules) {
                    // Check if schedule is active for this date
                    // Use Stockholm timezone for proper day boundary comparison
                    const parcelDateStart = parcelDate.startOfDay();
                    const scheduleStart = Time.fromDate(new Date(schedule.startDate)).startOfDay();
                    const scheduleEnd = Time.fromDate(new Date(schedule.endDate)).endOfDay();

                    // Skip schedules that don't include this date
                    if (!parcelDateStart.isBetween(scheduleStart, scheduleEnd)) continue;

                    const dayConfig = schedule.days.find(d => d.weekday === weekdayName);
                    if (dayConfig) {
                        if (dayConfig.isOpen && dayConfig.openingTime && dayConfig.closingTime) {
                            const openTime = dayConfig.openingTime.substring(0, 5);
                            const closeTime = dayConfig.closingTime.substring(0, 5);
                            locationOpeningHours = `${openTime}-${closeTime}`;
                        } else {
                            locationIsClosed = true;
                        }
                        break;
                    }
                }

                // If no schedule found for this day, it's closed
                if (!locationOpeningHours && !locationIsClosed) {
                    locationIsClosed = true;
                }
            }

            return {
                parcelId: parcel.parcelId,
                householdId: parcel.householdId,
                householdFirstName: parcel.householdFirstName,
                householdLastName: parcel.householdLastName,
                pickupDateEarliest: parcel.pickupDateEarliest.toISOString(),
                pickupDateLatest: parcel.pickupDateLatest.toISOString(),
                locationId: parcel.locationId,
                locationName: parcel.locationName,
                locationOpeningHours,
                locationIsClosed,
            };
        });

        // 3. Query SMS failures - ALL intents, not just upcoming parcels
        const failedSmsRaw = await db
            .select({
                id: outgoingSms.id,
                intent: outgoingSms.intent,
                householdId: outgoingSms.household_id,
                householdFirstName: households.first_name,
                householdLastName: households.last_name,
                parcelId: outgoingSms.parcel_id,
                parcelPickupEarliest: foodParcels.pickup_date_time_earliest,
                status: outgoingSms.status,
                providerStatus: outgoingSms.provider_status,
                errorMessage: outgoingSms.last_error_message,
                sentAt: outgoingSms.sent_at,
                createdAt: outgoingSms.created_at,
            })
            .from(outgoingSms)
            .innerJoin(households, eq(outgoingSms.household_id, households.id))
            .leftJoin(foodParcels, eq(outgoingSms.parcel_id, foodParcels.id))
            .where(
                and(
                    isNull(outgoingSms.dismissed_at), // Not dismissed
                    isNull(households.anonymized_at), // Exclude anonymized households
                    eq(outgoingSms.balance_failure, false), // Balance failures shown in banner instead
                    or(
                        eq(outgoingSms.status, "failed"), // Internal failure
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
            )
            .orderBy(asc(outgoingSms.created_at))
            .limit(100);

        const failedSms = failedSmsRaw.map(sms => {
            return {
                id: sms.id,
                intent: sms.intent,
                householdId: sms.householdId,
                householdFirstName: sms.householdFirstName,
                householdLastName: sms.householdLastName,
                parcelId: sms.parcelId,
                pickupEarliest: sms.parcelPickupEarliest?.toISOString() ?? null,
                errorMessage: sanitizeErrorMessage(sms.errorMessage),
                failureType: getFailureType(
                    sms.status,
                    sms.providerStatus,
                    sms.sentAt,
                    staleThreshold,
                ),
                createdAt: sms.createdAt.toISOString(),
            };
        });

        const unresolvedHandouts = unresolvedHandoutsRaw.map(p => ({
            parcelId: p.parcelId,
            householdId: p.householdId,
            householdFirstName: p.householdFirstName,
            householdLastName: p.householdLastName,
            pickupDateEarliest: p.pickupDateEarliest.toISOString(),
            pickupDateLatest: p.pickupDateLatest.toISOString(),
            locationName: p.locationName,
        }));

        // 4. Query no-show follow-ups - households that have exceeded no-show thresholds
        let noShowFollowups: {
            householdId: string;
            householdFirstName: string;
            householdLastName: string;
            consecutiveNoShows: number;
            totalNoShows: number;
            lastNoShowAt: string;
            triggerType: "consecutive" | "total" | "both";
        }[] = [];
        let noShowFollowupsCount = 0;

        const noShowConfig = await getNoShowFollowupConfig();

        if (noShowConfig.enabled) {
            const { rows, totalCount } = await queryNoShowFollowups(
                noShowConfig.consecutiveThreshold,
                noShowConfig.totalThreshold,
            );

            noShowFollowupsCount = totalCount;

            noShowFollowups = rows.map(row => {
                const meetsConsecutive =
                    row.consecutive_no_shows >= noShowConfig.consecutiveThreshold;
                const meetsTotal = row.total_no_shows >= noShowConfig.totalThreshold;
                let triggerType: "consecutive" | "total" | "both" = "total";
                if (meetsConsecutive && meetsTotal) {
                    triggerType = "both";
                } else if (meetsConsecutive) {
                    triggerType = "consecutive";
                }

                return {
                    householdId: row.household_id,
                    householdFirstName: row.first_name,
                    householdLastName: row.last_name,
                    consecutiveNoShows: row.consecutive_no_shows,
                    totalNoShows: row.total_no_shows,
                    lastNoShowAt:
                        row.last_no_show_at instanceof Date
                            ? row.last_no_show_at.toISOString()
                            : new Date(row.last_no_show_at).toISOString(),
                    triggerType,
                };
            });
        }

        // Use accurate counts from count queries (not limited array lengths)
        const totalCount =
            (unresolvedHandoutsCount?.count ?? 0) +
            outsideHoursCount +
            (failedSmsCount?.count ?? 0) +
            noShowFollowupsCount;

        return NextResponse.json(
            {
                unresolvedHandouts,
                outsideHours,
                failedSms,
                noShowFollowups,
                counts: {
                    total: totalCount,
                    unresolvedHandouts: unresolvedHandoutsCount?.count ?? 0,
                    outsideHours: outsideHoursCount,
                    failedSms: failedSmsCount?.count ?? 0,
                    noShowFollowups: noShowFollowupsCount,
                },
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            },
        );
    } catch (error) {
        logError("Error fetching issues", error, {
            method: "GET",
            path: "/api/admin/issues",
        });
        return NextResponse.json({ error: "Failed to fetch issues" }, { status: 500 });
    }
}
