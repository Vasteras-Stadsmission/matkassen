import { and, eq, sql } from "drizzle-orm";
import { db } from "@/app/db/drizzle";
import { handoutLocationScheduleDays, handoutLocationSchedules } from "@/app/db/schema";
import type { LocationScheduleInfo } from "@/app/[locale]/schedule/types";
import { Time } from "@/app/utils/time-provider";
import { logError } from "@/app/utils/logger";

/**
 * Fetch handout location schedules without relying on Next.js server features.
 * Used by background services (scheduler) and wrapped by server actions for caching.
 */
export async function fetchHandoutLocationSchedules(
    locationId: string,
): Promise<LocationScheduleInfo> {
    try {
        // Use localized date to align with Stockholm schedule boundaries
        const currentDateStr = Time.now().toDateString();

        const schedules = await db
            .select({
                id: handoutLocationSchedules.id,
                name: handoutLocationSchedules.name,
                startDate: handoutLocationSchedules.start_date,
                endDate: handoutLocationSchedules.end_date,
            })
            .from(handoutLocationSchedules)
            .where(
                and(
                    eq(handoutLocationSchedules.handout_location_id, locationId),
                    sql`${handoutLocationSchedules.end_date} >= ${currentDateStr}::date`,
                ),
            );

        const schedulesWithDays = await Promise.all(
            schedules.map(async schedule => {
                const days = await db
                    .select({
                        weekday: handoutLocationScheduleDays.weekday,
                        isOpen: handoutLocationScheduleDays.is_open,
                        openingTime: handoutLocationScheduleDays.opening_time,
                        closingTime: handoutLocationScheduleDays.closing_time,
                    })
                    .from(handoutLocationScheduleDays)
                    .where(eq(handoutLocationScheduleDays.schedule_id, schedule.id));

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
        logError("Error fetching handout location schedules", error, { locationId });
        return {
            schedules: [],
        };
    }
}
