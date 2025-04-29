import { startOfDay, endOfDay, startOfWeek, endOfWeek, getISOWeek } from "date-fns";
import { toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";

// Use Stockholm timezone consistently as specified in the requirements
const TIMEZONE = "Europe/Stockholm";

/**
 * Convert a date to a zoned date in Stockholm timezone
 */
export function toStockholmTime(date: Date): Date {
    return toZonedTime(date, TIMEZONE);
}

/**
 * Convert a Stockholm timezone date to UTC
 */
export function fromStockholmTime(date: Date): Date {
    return fromZonedTime(date, TIMEZONE);
}

/**
 * Format a date in Stockholm timezone
 */
export function formatStockholmDate(date: Date, formatString: string): string {
    return formatInTimeZone(date, TIMEZONE, formatString);
}

/**
 * Get the ISO week number for a date in Stockholm timezone
 */
export function getISOWeekNumber(date: Date): number {
    const stockholmDate = toStockholmTime(date);
    return getISOWeek(stockholmDate);
}

/**
 * Get the start and end dates of the week containing the specified date
 * in Stockholm timezone
 */
export function getWeekDates(date: Date): { start: Date; end: Date } {
    // Convert to Stockholm timezone
    const stockholmDate = toStockholmTime(date);

    // Get start of week (Monday) and end of week (Sunday) in Stockholm timezone
    const start = startOfWeek(stockholmDate, { weekStartsOn: 1 }); // 1 = Monday
    const end = endOfWeek(stockholmDate, { weekStartsOn: 1 });

    // Set start to beginning of day and end to end of day
    const startOfDayTime = startOfDay(start);
    const endOfDayTime = endOfDay(end);

    // Convert back to UTC for storage
    return {
        start: fromStockholmTime(startOfDayTime),
        end: fromStockholmTime(endOfDayTime),
    };
}

/**
 * Check if a time slot is in the past (Stockholm timezone)
 */
export function isPastTimeSlot(date: Date, timeString: string): boolean {
    const now = new Date();
    const stockholmNow = toStockholmTime(now);

    // Convert the date to Stockholm timezone
    const stockholmDate = toStockholmTime(date);

    // Parse the time string (e.g., "14:30")
    const [hours, minutes] = timeString.split(":").map(Number);

    // Set the hours and minutes on the Stockholm date
    stockholmDate.setHours(hours, minutes, 0, 0);

    return stockholmDate < stockholmNow;
}

/**
 * Format a date as YYYY-MM-DD in Stockholm timezone
 */
export function formatDateToYMD(date: Date): string {
    return formatInTimeZone(date, TIMEZONE, "yyyy-MM-dd");
}

/**
 * Format a time in HH:mm format in Stockholm timezone
 */
export function formatTime(date: Date): string {
    return formatInTimeZone(date, TIMEZONE, "HH:mm");
}
