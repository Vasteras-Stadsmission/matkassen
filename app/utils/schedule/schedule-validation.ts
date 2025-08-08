/**
 * This file contains utility functions for validating schedules
 * and calculating things like week numbers and detecting overlaps
 */

import {
    PickupLocationScheduleWithDays,
    ScheduleDateRange,
    WeekSelection,
} from "@/app/[locale]/handout-locations/types";

/**
 * Checks if two date ranges overlap with each other
 * @param range1 First date range
 * @param range2 Second date range
 * @returns True if the ranges overlap, false otherwise
 */
export function doDateRangesOverlap(range1: ScheduleDateRange, range2: ScheduleDateRange): boolean {
    // If the ranges have the same ID, they're the same schedule so not an overlap
    if (range1.id && range2.id && range1.id === range2.id) {
        return false;
    }

    // Normalize dates to midnight UTC to avoid timezone issues
    // This ensures we're comparing dates consistently regardless of timezone
    const normalizeDate = (date: Date): Date => {
        const normalized = new Date(date);
        normalized.setUTCHours(0, 0, 0, 0);
        return normalized;
    };

    const start1 = normalizeDate(range1.start_date);
    const end1 = normalizeDate(range1.end_date);
    const start2 = normalizeDate(range2.start_date);
    const end2 = normalizeDate(range2.end_date);

    // For date ranges to overlap, they must have at least one day in common
    // Two ranges overlap if: start1 <= end2 AND end1 >= start2
    // However, we want consecutive schedules (e.g., June 10 ending, June 11 starting)
    // to NOT be considered overlapping, so we use strict inequality for the boundaries
    return start1 <= end2 && end1 >= start2;
}

/**
 * Finds if a new schedule overlaps with any existing schedules
 * @param newSchedule The schedule to check for overlaps
 * @param existingSchedules Array of existing schedules to check against
 * @returns The overlapping schedule or null if no overlap
 */
export function findOverlappingSchedule(
    newSchedule: ScheduleDateRange,
    existingSchedules: ScheduleDateRange[],
): ScheduleDateRange | null {
    // If editing an existing schedule, exclude it from the overlap check
    const schedules = existingSchedules.filter(s => s.id !== newSchedule.id);

    for (const schedule of schedules) {
        if (doDateRangesOverlap(newSchedule, schedule)) {
            return schedule;
        }
    }

    return null;
}

/**
 * Get the ISO week number for a given date
 * @param date The date to get the week number for
 * @returns The ISO week number (1-53)
 */
export function getISOWeekNumber(date: Date): number {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    // Get first day of year
    const yearStart = new Date(d.getFullYear(), 0, 1);
    // Calculate full weeks to nearest Thursday
    const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return weekNum;
}

/**
 * Get the week number and year for a specific date
 * @param date The date to get the week number and year for
 * @returns Object containing the week number and year
 */
export function getWeekAndYear(date: Date): WeekSelection {
    return {
        week: getISOWeekNumber(date),
        year: date.getFullYear(),
    };
}

/**
 * Get all week numbers in a date range
 * @param startDate The start date
 * @param endDate The end date
 * @returns Array of week numbers included in the range
 */
export function getWeekNumbersInRange(startDate: Date, endDate: Date): number[] {
    const weeks = new Set<number>();
    const currentDate = new Date(startDate);

    // Iterate through the date range one day at a time
    while (currentDate <= endDate) {
        weeks.add(getISOWeekNumber(currentDate));
        currentDate.setDate(currentDate.getDate() + 1);
    }

    // Convert to array and sort chronologically based on dates, not just numerically
    // This ensures week numbers like [52, 1] maintain their chronological order
    const weekArray = Array.from(weeks);
    const startWeek = getISOWeekNumber(startDate);

    // If the range spans a year transition (e.g., week 52 to week 1)
    // and both weeks are present, maintain chronological order
    if (weekArray.includes(startWeek) && weekArray.length > 1) {
        // Create a map of weeks to their positions in the year
        const weekPositions = new Map<number, number>();

        // Populate positions for weeks in the current year
        for (const week of weekArray) {
            // Calculate the approximate day of the year for this week
            const dayOfYear = (week - 1) * 7 + 1;

            // If this is likely a week in the next year (e.g., week 1 when startWeek is 52)
            // add 366 to position it chronologically after weeks from the current year
            const position =
                startWeek > 40 && week < 10
                    ? dayOfYear + 366 // Position in next year
                    : dayOfYear; // Position in current year

            weekPositions.set(week, position);
        }

        // Sort based on chronological position rather than week number
        return weekArray.sort((a, b) => (weekPositions.get(a) || 0) - (weekPositions.get(b) || 0));
    }

    // If not spanning year transition, normal numeric sort is fine
    return weekArray.sort((a, b) => a - b);
}

/**
 * Get the start and end dates of a specific ISO week in a year
 * @param year The year
 * @param weekNumber The ISO week number (1-53)
 * @returns The start date (Monday) and end date (Sunday) of the week
 */
export function getWeekDateRange(
    year: number,
    weekNumber: number,
): { startDate: Date; endDate: Date } {
    // ISO 8601: Week 1 is the first week with at least 4 days in the new year
    // January 4th is always in week 1, so we use it as our reference

    // Create January 4th as a UTC date to avoid timezone issues
    const jan4 = new Date(Date.UTC(year, 0, 4));

    // Get the Monday of week 1 (ISO week starts on Monday)
    // getUTCDay() returns 0 for Sunday, 1 for Monday, etc.
    const dayOfWeek = jan4.getUTCDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday needs -6, others need 1-dayOfWeek

    const mondayWeek1 = new Date(jan4);
    mondayWeek1.setUTCDate(jan4.getUTCDate() + daysToMonday);

    // Calculate the Monday of the requested week
    const targetMonday = new Date(mondayWeek1);
    targetMonday.setUTCDate(mondayWeek1.getUTCDate() + (weekNumber - 1) * 7);

    // Calculate the Sunday of the requested week
    const targetSunday = new Date(targetMonday);
    targetSunday.setUTCDate(targetMonday.getUTCDate() + 6);

    // Set times to beginning and end of day in UTC
    targetMonday.setUTCHours(0, 0, 0, 0);
    targetSunday.setUTCHours(23, 59, 59, 999);

    return {
        startDate: targetMonday,
        endDate: targetSunday,
    };
}

/**
 * Check if a date falls within any active schedule
 * @param date The date to check
 * @param schedules Array of schedules
 * @returns The matching schedule or null if no match
 */
export function findScheduleForDate(
    date: Date,
    schedules: PickupLocationScheduleWithDays[],
): PickupLocationScheduleWithDays | null {
    const checkDate = new Date(date);

    for (const schedule of schedules) {
        const startDate = new Date(schedule.start_date);
        const endDate = new Date(schedule.end_date);

        if (checkDate >= startDate && checkDate <= endDate) {
            return schedule;
        }
    }

    return null;
}

/**
 * Gets the weekday name for a specific date
 * @param date The date object
 * @returns The weekday name in lowercase
 */
export function getWeekdayName(date: Date): string {
    const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    return weekdays[date.getDay()];
}

/**
 * Check if a location is open on a specific date and time
 * @param date The date and time to check
 * @param schedules Array of location schedules
 * @returns Whether the location is open at the specified date and time
 */
export function isLocationOpenAt(date: Date, schedules: PickupLocationScheduleWithDays[]): boolean {
    // Find applicable schedule for the date
    const schedule = findScheduleForDate(date, schedules);
    if (!schedule) return false;

    // Get weekday name
    const weekdayName = getWeekdayName(date);

    // Find day configuration in schedule
    const dayConfig = schedule.days.find(day => day.weekday === weekdayName);
    if (!dayConfig || !dayConfig.is_open) return false;

    // Check if current time is within opening hours
    const time =
        date.getHours().toString().padStart(2, "0") +
        ":" +
        date.getMinutes().toString().padStart(2, "0");

    return (
        dayConfig.opening_time !== null &&
        dayConfig.closing_time !== null &&
        time >= dayConfig.opening_time &&
        time <= dayConfig.closing_time
    );
}

/**
 * Validates a week selection for start and end weeks
 * @param startWeek The start week selection
 * @param endWeek The end week selection
 * @returns Validation result with valid flag and optional error message
 */
export function validateWeekSelection(
    startWeek: WeekSelection | null,
    endWeek: WeekSelection | null,
): { valid: boolean; error?: string } {
    // Both weeks must be selected
    if (!startWeek || !endWeek) {
        return {
            valid: false,
            error: "Start and end weeks are required",
        };
    }

    // Start week can't be after end week
    if (
        startWeek.year > endWeek.year ||
        (startWeek.year === endWeek.year && startWeek.week > endWeek.week)
    ) {
        return {
            valid: false,
            error: "Start week cannot be after end week",
        };
    }

    // All validations passed
    return { valid: true };
}
