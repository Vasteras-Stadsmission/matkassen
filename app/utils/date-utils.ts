import {
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    getISOWeek,
    addMinutes,
    subMinutes,
    format,
    parse,
    isBefore,
} from "date-fns";
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
 * Convert a date to a zoned date in Stockholm timezone
 * (Alias for toStockholmTime for backward compatibility)
 */
export function toStockholmDate(date: Date): Date {
    return toStockholmTime(date);
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
    const utcStart = fromStockholmTime(startOfDayTime);
    const utcEnd = fromStockholmTime(endOfDayTime);

    return {
        start: utcStart,
        end: utcEnd,
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

/**
 * Format a date with localized month name (d MMMM yyyy)
 * @param date The date to format
 * @param t The translation function to use for month names
 * @returns Formatted date string like "6 June 2025" or "6 juni 2025" based on locale
 */
export function formatDateWithLocalizedMonth(
    date: Date,
    getLocalizedMonth: (monthIndex: number) => string,
): string {
    const stockholmDate = toStockholmTime(date);
    const day = stockholmDate.getDate();
    const month = stockholmDate.getMonth(); // 0-11
    const year = stockholmDate.getFullYear();

    // Get the localized month name using the passed translation function
    const monthName = getLocalizedMonth(month);

    return `${day} ${monthName} ${year}`;
}

/**
 * Set a date to the start of day (00:00:00.000) in Stockholm timezone
 * @param date The date to normalize
 * @returns Date normalized to start of day in Stockholm timezone
 */
export function setToStartOfDay(date: Date): Date {
    // Convert to Stockholm timezone first to ensure correct day boundary
    const stockholmDate = toStockholmTime(date);
    // Set to start of day
    const startOfDayDate = startOfDay(stockholmDate);
    // Convert back to UTC for storage/comparison
    return fromStockholmTime(startOfDayDate);
}

/**
 * Set a date to the end of day (23:59:59.999) in Stockholm timezone
 * @param date The date to set to end of day
 * @returns Date set to end of day in Stockholm timezone
 */
export function setToEndOfDay(date: Date): Date {
    // Convert to Stockholm timezone first to ensure correct day boundary
    const stockholmDate = toStockholmTime(date);
    // Set to end of day
    const endOfDayDate = endOfDay(stockholmDate);
    // Convert back to UTC for storage/comparison
    return fromStockholmTime(endOfDayDate);
}

/**
 * Extract date parts (year, month, day) from a date in Stockholm timezone
 * @param date The date to extract parts from
 * @returns Object with year, month (1-12), and day parts
 */
export function getDateParts(date: Date): { year: number; month: number; day: number } {
    const stockholmDate = toStockholmTime(date);
    return {
        year: stockholmDate.getFullYear(),
        month: stockholmDate.getMonth() + 1, // getMonth() returns 0-11, so add 1 for 1-12 range
        day: stockholmDate.getDate(),
    };
}

/**
 * Format a date as ISO date string (YYYY-MM-DD) using Stockholm timezone
 * @param date The date to format
 * @returns ISO date string (YYYY-MM-DD) in Stockholm timezone
 */
export function formatDateToISOString(date: Date): string {
    // This will format in YYYY-MM-DD format according to Stockholm timezone
    return formatDateToYMD(date);
}

/**
 * Parse a date from an ISO date string (YYYY-MM-DD) in Stockholm timezone
 * @param dateString ISO date string (YYYY-MM-DD)
 * @returns Date object in UTC
 */
export function parseISODateString(dateString: string): Date {
    // Create a date object from ISO string and ensure it's treated as Stockholm timezone
    const [year, month, day] = dateString.split("-").map(Number);
    const stockholmDate = new Date();
    stockholmDate.setFullYear(year, month - 1, day);
    stockholmDate.setHours(0, 0, 0, 0);

    // Convert to Stockholm timezone and then back to UTC
    return fromStockholmTime(toStockholmTime(stockholmDate));
}

/**
 * Convert minutes since start of day to an HH:mm string
 */
export function minutesToHHmm(totalMinutes: number): string {
    const base = startOfDay(new Date());
    return format(addMinutes(base, totalMinutes), "HH:mm");
}

/**
 * Normalize a time string to HH:mm. Accepts inputs like HH:mm or HH:mm:ss.
 * Returns the original string if it cannot be parsed.
 */
function normalizeToHHmm(time: string): string {
    const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return time;
    const hours = Math.max(0, Math.min(23, parseInt(match[1], 10)));
    const minutes = Math.max(0, Math.min(59, parseInt(match[2], 10)));
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Subtract minutes from an HH:mm string and return HH:mm, clamped to 00:00
 */
export function subtractMinutesFromHHmm(time: string, minutes: number): string {
    const base = startOfDay(new Date());
    const normalized = normalizeToHHmm(time);
    const parsed = parse(normalized, "HH:mm", base);
    if (Number.isNaN(parsed.getTime())) return time;
    const result = subMinutes(parsed, minutes);
    return isBefore(result, base) ? "00:00" : format(result, "HH:mm");
}

/**
 * Add minutes to an HH:mm string and return HH:mm (no wrap-around beyond 23:59)
 */
export function addMinutesToHHmm(time: string, minutesToAdd: number): string {
    const base = startOfDay(new Date());
    const normalized = normalizeToHHmm(time);
    const parsed = parse(normalized, "HH:mm", base);
    if (Number.isNaN(parsed.getTime())) return time;
    const result = addMinutes(parsed, minutesToAdd);
    // Clamp to end of day if needed
    const endOfBaseDay = endOfDay(base);
    const clamped = isBefore(result, endOfBaseDay) ? result : endOfBaseDay;
    return format(clamped, "HH:mm");
}

/**
 * Convert an HH:mm string to total minutes since start of day. Returns null if invalid
 */
export function hhmmToMinutes(time: string): number | null {
    const base = startOfDay(new Date());
    const normalized = normalizeToHHmm(time);
    const parsed = parse(normalized, "HH:mm", base);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.getHours() * 60 + parsed.getMinutes();
}

/**
 * Generate time slots between two HH:mm strings with a given step size.
 * If requireSlotEndWithinClose is true, only includes slots whose end time
 * (start + step) is <= closing time. Otherwise includes all starts < closing time.
 */
export function generateTimeSlotsBetween(
    openingHHmm: string,
    closingHHmm: string,
    stepMinutes: number,
    requireSlotEndWithinClose = false,
): string[] {
    const base = startOfDay(new Date());
    const start = parse(normalizeToHHmm(openingHHmm), "HH:mm", base);
    const end = parse(normalizeToHHmm(closingHHmm), "HH:mm", base);
    if (
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        stepMinutes <= 0 ||
        !isBefore(start, end)
    ) {
        return [];
    }

    const slots: string[] = [];
    let current = start;
    while (true) {
        if (requireSlotEndWithinClose) {
            const slotEnd = addMinutes(current, stepMinutes);
            if (slotEnd.getTime() > end.getTime()) break;
        } else {
            if (!(current.getTime() < end.getTime())) break;
        }
        slots.push(format(current, "HH:mm"));
        current = addMinutes(current, stepMinutes);
    }
    return slots;
}
