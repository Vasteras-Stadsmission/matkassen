import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import {
    foodParcels,
    outgoingSms,
    households,
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
} from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, and, gte, lt, asc, isNull, or, sql } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { logError } from "@/app/utils/logger";
import { Time } from "@/app/utils/time-provider";
import {
    isParcelOutsideOpeningHours,
    type ParcelTimeInfo,
    type LocationScheduleInfo,
} from "@/app/utils/schedule/outside-hours-filter";

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
 * Fetch location schedules for checking opening hours
 */
async function getLocationSchedulesMap(): Promise<Map<string, LocationScheduleInfo>> {
    const scheduleData = await db
        .select({
            locationId: pickupLocationSchedules.pickup_location_id,
            scheduleId: pickupLocationSchedules.id,
            scheduleName: pickupLocationSchedules.name,
            startDate: pickupLocationSchedules.start_date,
            endDate: pickupLocationSchedules.end_date,
            weekday: pickupLocationScheduleDays.weekday,
            isOpen: pickupLocationScheduleDays.is_open,
            openingTime: pickupLocationScheduleDays.opening_time,
            closingTime: pickupLocationScheduleDays.closing_time,
        })
        .from(pickupLocationSchedules)
        .leftJoin(
            pickupLocationScheduleDays,
            eq(pickupLocationScheduleDays.schedule_id, pickupLocationSchedules.id),
        );

    const locationMap = new Map<string, LocationScheduleInfo>();

    for (const row of scheduleData) {
        if (!locationMap.has(row.locationId)) {
            locationMap.set(row.locationId, { schedules: [] });
        }

        const info = locationMap.get(row.locationId)!;
        let schedule = info.schedules.find(s => s.id === row.scheduleId);

        if (!schedule) {
            schedule = {
                id: row.scheduleId,
                name: row.scheduleName,
                startDate: row.startDate,
                endDate: row.endDate,
                days: [],
            };
            info.schedules.push(schedule);
        }

        if (row.weekday) {
            schedule.days.push({
                weekday: row.weekday,
                isOpen: row.isOpen ?? false,
                openingTime: row.openingTime,
                closingTime: row.closingTime,
            });
        }
    }

    return locationMap;
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
        const staleThreshold = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);

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
                    // Date-based check: pickup_date_time_latest's DATE < today's DATE (Stockholm)
                    sql`(${foodParcels.pickup_date_time_latest} AT TIME ZONE 'Europe/Stockholm')::date < (NOW() AT TIME ZONE 'Europe/Stockholm')::date`,
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
                    gte(foodParcels.pickup_date_time_earliest, now), // Future only
                ),
            )
            .orderBy(asc(foodParcels.pickup_date_time_earliest))
            .limit(500); // Check more for outside-hours

        // Get location schedules for outside-hours check
        const locationSchedulesMap = await getLocationSchedulesMap();

        // Filter to only parcels outside opening hours
        const outsideHours = futureParcelsRaw
            .filter(parcel => {
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
            })
            .slice(0, 100) // Limit after filtering
            .map(parcel => {
                // Get opening time for the parcel's date from schedule
                const scheduleInfo = locationSchedulesMap.get(parcel.locationId);
                let locationOpensAt: string | null = null;

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

                    for (const schedule of scheduleInfo.schedules) {
                        const dayConfig = schedule.days.find(d => d.weekday === weekdayName);
                        if (dayConfig?.isOpen && dayConfig.openingTime) {
                            locationOpensAt = dayConfig.openingTime.substring(0, 5); // HH:mm
                            break;
                        }
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
                    locationOpensAt,
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
                status: outgoingSms.status,
                providerStatus: outgoingSms.provider_status,
                errorMessage: outgoingSms.last_error_message,
                sentAt: outgoingSms.sent_at,
                createdAt: outgoingSms.created_at,
            })
            .from(outgoingSms)
            .innerJoin(households, eq(outgoingSms.household_id, households.id))
            .where(
                and(
                    isNull(outgoingSms.dismissed_at), // Not dismissed
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

        const failedSms = failedSmsRaw.map(sms => ({
            id: sms.id,
            intent: sms.intent,
            householdId: sms.householdId,
            householdFirstName: sms.householdFirstName,
            householdLastName: sms.householdLastName,
            parcelId: sms.parcelId,
            errorMessage: sanitizeErrorMessage(sms.errorMessage),
            failureType: getFailureType(sms.status, sms.providerStatus, sms.sentAt, staleThreshold),
            createdAt: sms.createdAt.toISOString(),
        }));

        const unresolvedHandouts = unresolvedHandoutsRaw.map(p => ({
            parcelId: p.parcelId,
            householdId: p.householdId,
            householdFirstName: p.householdFirstName,
            householdLastName: p.householdLastName,
            pickupDateEarliest: p.pickupDateEarliest.toISOString(),
            pickupDateLatest: p.pickupDateLatest.toISOString(),
            locationName: p.locationName,
        }));

        return NextResponse.json(
            {
                unresolvedHandouts,
                outsideHours,
                failedSms,
                counts: {
                    total: unresolvedHandouts.length + outsideHours.length + failedSms.length,
                    unresolvedHandouts: unresolvedHandouts.length,
                    outsideHours: outsideHours.length,
                    failedSms: failedSms.length,
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
