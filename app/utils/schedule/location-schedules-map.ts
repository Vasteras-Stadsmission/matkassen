/**
 * Utility to fetch and build a map of location schedules from the database.
 * Used by multiple endpoints to check opening hours.
 */

import { db } from "@/app/db/drizzle";
import { pickupLocationSchedules, pickupLocationScheduleDays } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import type { LocationScheduleInfo } from "./outside-hours-filter";

/**
 * Fetches all location schedules and builds a map keyed by location ID.
 * This is used by issues endpoints to check if parcels are outside opening hours.
 *
 * @returns Map where key is location ID and value is the schedule info
 */
export async function getLocationSchedulesMap(): Promise<Map<string, LocationScheduleInfo>> {
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

    return buildLocationSchedulesMap(scheduleData);
}

/**
 * Builds a location schedules map from raw schedule data rows.
 * Exported for testing with mock data.
 */
export function buildLocationSchedulesMap(
    scheduleData: Array<{
        locationId: string;
        scheduleId: string;
        scheduleName: string;
        startDate: string | Date;
        endDate: string | Date;
        weekday: string | null;
        isOpen: boolean | null;
        openingTime: string | null;
        closingTime: string | null;
    }>,
): Map<string, LocationScheduleInfo> {
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
