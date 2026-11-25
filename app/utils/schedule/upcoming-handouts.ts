import type { DailyLimitMonthData } from "@/app/utils/capacity/daily-limits";

/** How far the Schedule hub looks ahead, in days after today. */
export const UPCOMING_HANDOUT_DAYS_AHEAD = 14;
export const MAX_UPCOMING_HANDOUTS = 2;
/** Same threshold as the Statistics page's capacity alert. */
const ALMOST_FULL_PERCENT = 80;

export interface UpcomingHandout {
    date: string; // YYYY-MM-DD, Stockholm
    booked: number;
    limit: number | null;
}

export type HandoutCapacityLevel = "unlimited" | "available" | "almostFull" | "full" | "over";

export function addDaysToDateKey(dateKey: string, days: number): string {
    const date = new Date(`${dateKey}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

/**
 * A handout day is a day the schedule opens, or a closed day that still has
 * bookings, so staff see those too.
 */
export function pickUpcomingHandouts(
    data: Pick<DailyLimitMonthData, "openDates" | "bookedCounts" | "effectiveDailyLimits">,
    max = MAX_UPCOMING_HANDOUTS,
): UpcomingHandout[] {
    const bookedDates = Object.keys(data.bookedCounts).filter(date => data.bookedCounts[date] > 0);
    return [...new Set([...data.openDates, ...bookedDates])]
        .sort()
        .slice(0, max)
        .map(date => ({
            date,
            booked: data.bookedCounts[date] ?? 0,
            limit: data.effectiveDailyLimits[date] ?? null,
        }));
}

export function getHandoutCapacityLevel(
    booked: number,
    limit: number | null,
): HandoutCapacityLevel {
    if (limit === null) return "unlimited";
    if (booked > limit) return "over";
    if (booked === limit) return "full";
    if (booked * 100 >= limit * ALMOST_FULL_PERCENT) return "almostFull";
    return "available";
}
