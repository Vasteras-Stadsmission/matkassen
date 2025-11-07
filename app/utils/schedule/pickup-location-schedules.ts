import { and, eq, sql } from "drizzle-orm";
import { db } from "@/app/db/drizzle";
import { pickupLocationScheduleDays, pickupLocationSchedules } from "@/app/db/schema";
import type { LocationScheduleInfo } from "@/app/[locale]/schedule/types";
import { Time } from "@/app/utils/time-provider";
import { logError } from "@/app/utils/logger";

/**
 * Fetch pickup location schedules without relying on Next.js server features.
 * Used by background services (scheduler) and wrapped by server actions for caching.
 */
export async function fetchPickupLocationSchedules(
    locationId: string,
): Promise<LocationScheduleInfo> {
    try {
        // Use localized date to align with Stockholm schedule boundaries
        const currentDateStr = Time.now().toDateString();

        const schedules = await db
            .select({
                id: pickupLocationSchedules.id,
                name: pickupLocationSchedules.name,
                startDate: pickupLocationSchedules.start_date,
                endDate: pickupLocationSchedules.end_date,
            })
            .from(pickupLocationSchedules)
            .where(
                and(
                    eq(pickupLocationSchedules.pickup_location_id, locationId),
                    sql`${pickupLocationSchedules.end_date} >= ${currentDateStr}::date`,
                ),
            );

        const schedulesWithDays = await Promise.all(
            schedules.map(async schedule => {
                const days = await db
                    .select({
                        weekday: pickupLocationScheduleDays.weekday,
                        isOpen: pickupLocationScheduleDays.is_open,
                        openingTime: pickupLocationScheduleDays.opening_time,
                        closingTime: pickupLocationScheduleDays.closing_time,
                    })
                    .from(pickupLocationScheduleDays)
                    .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

                return {
                    ...schedule,
                    days,
                };
            }),
        );

        return {
            schedules: schedulesWithDays,
        };
    } catch (error) {
        logError("Error fetching pickup location schedules", error, { locationId });
        return {
            schedules: [],
        };
    }
}
