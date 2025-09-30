/**
 * Schedule utility functions for location availability validation
 */
import { Time } from "@/app/utils/time-provider";
import { LocationScheduleInfo } from "@/app/[locale]/schedule/types";

/**
 * Check if a date is available according to location schedules
 */
export function isDateAvailable(
    date: Date,
    scheduleInfo: LocationScheduleInfo,
): {
    isAvailable: boolean;
    reason?: string;
    openingTime?: string;
    closingTime?: string;
} {
    // Convert date to Stockholm time to ensure consistent timezone handling
    const stockholmTime = Time.fromDate(date);
    const weekdayName = stockholmTime.getWeekdayName();
    const dateStart = stockholmTime.startOfDay();

    // Track the most "permissive" schedule (prioritize open over closed)
    let bestSchedule: {
        isAvailable: boolean;
        reason?: string;
        openingTime?: string;
        closingTime?: string;
    } = {
        isAvailable: false,
        reason: "No scheduled hours",
    };

    // Use either schedules or weeklySchedules (for test compatibility)
    const schedulesToCheck = scheduleInfo.schedules || [];

    // Check all schedules for this date
    for (const schedule of schedulesToCheck) {
        const scheduleStart = Time.fromDate(new Date(schedule.startDate)).startOfDay();
        const scheduleEnd = Time.fromDate(new Date(schedule.endDate)).endOfDay();

        // Skip schedules that don't include this date
        if (!dateStart.isBetween(scheduleStart, scheduleEnd)) {
            continue;
        }

        // Find day configuration for this weekday
        // We need to properly type this dynamic access to the day config
        const dayConfig = schedule.days.find(day => day.weekday === weekdayName);

        if (dayConfig) {
            // If we find an open schedule, prioritize it over closed ones
            if (dayConfig.isOpen) {
                return {
                    isAvailable: true,
                    openingTime: dayConfig.openingTime ?? undefined,
                    closingTime: dayConfig.closingTime ?? undefined,
                };
            } else if (!bestSchedule.isAvailable) {
                // Only update if we haven't found an open schedule yet
                bestSchedule = {
                    isAvailable: false,
                    reason: "Closed on this day",
                    openingTime: dayConfig.openingTime ?? undefined,
                    closingTime: dayConfig.closingTime ?? undefined,
                };
            }
        }
    }

    // Return the best schedule we found, or the default "no schedule" response
    return bestSchedule;
}

/**
 * Check if a specific time is available on a given date
 */
export function isTimeAvailable(
    date: Date,
    time: string,
    scheduleInfo: LocationScheduleInfo,
): { isAvailable: boolean; reason?: string } {
    // Extract just the date portion (ignore time) for schedule checking
    // We need to work with the Stockholm date to ensure consistent day boundaries
    const stockholmTime = Time.fromDate(date);
    const dateOnly = stockholmTime.startOfDay().toDate();

    // First check if date is available at all
    const dateAvailability = isDateAvailable(dateOnly, scheduleInfo);
    if (!dateAvailability.isAvailable) {
        return dateAvailability;
    }

    // Date is available, get the opening hours
    const { openingTime, closingTime } = dateAvailability;

    if (!openingTime || !closingTime) {
        // Should not happen if date is available, but handle the case anyway
        return { isAvailable: true };
    }

    // Convert times to minutes for easy comparison
    const [hours, minutes] = time.split(":").map(Number);
    const timeValue = hours * 60 + minutes;

    const [openHours, openMinutes] = openingTime.split(":").map(Number);
    const openValue = openHours * 60 + openMinutes;

    const [closeHours, closeMinutes] = closingTime.split(":").map(Number);
    const closeValue = closeHours * 60 + closeMinutes;

    // Check if time is within opening hours
    // Allow times that end exactly at closing time (>= should be > for the end boundary)
    if (timeValue < openValue || timeValue > closeValue) {
        return {
            isAvailable: false,
            reason: `This location is only open from ${openingTime} to ${closingTime} on this day`,
        };
    }

    return { isAvailable: true };
}

/**
 * Get the available time range for a specific date
 */
export function getAvailableTimeRange(
    date: Date,
    locationSchedule: LocationScheduleInfo,
): {
    earliestTime: string | null;
    latestTime: string | null;
} {
    // Convert date to Stockholm time to ensure consistent timezone handling
    const stockholmTime = Time.fromDate(date);
    const weekdayName = stockholmTime.getWeekdayName();
    const dateStart = stockholmTime.startOfDay();

    // Use either schedules or weeklySchedules for test compatibility
    const schedulesToCheck = locationSchedule.schedules || [];

    // Track if we found any open schedule
    let foundOpenSchedule = false;
    let earliestTime: string | null = null;
    let latestTime: string | null = null;

    // Check all schedules for this date
    for (const schedule of schedulesToCheck) {
        const scheduleStart = Time.fromDate(new Date(schedule.startDate)).startOfDay();
        const scheduleEnd = Time.fromDate(new Date(schedule.endDate)).endOfDay();

        // Skip schedules that don't include this date
        if (!dateStart.isBetween(scheduleStart, scheduleEnd)) {
            continue;
        }

        // Find day configuration for this weekday - directly use the property for the day
        const dayConfig = schedule.days.find(day => day.weekday === weekdayName);

        if (dayConfig && dayConfig.isOpen) {
            // Found an open schedule
            foundOpenSchedule = true;

            // If this is our first open schedule, just use its times
            if (earliestTime === null || latestTime === null) {
                earliestTime = dayConfig.openingTime;
                latestTime = dayConfig.closingTime;
            } else {
                // Otherwise, compare with existing times to find the most permissive schedule
                // (earliest opening, latest closing)
                if (dayConfig.openingTime && dayConfig.openingTime < earliestTime) {
                    earliestTime = dayConfig.openingTime;
                }
                if (dayConfig.closingTime && dayConfig.closingTime > latestTime) {
                    latestTime = dayConfig.closingTime;
                }
            }
        }
    }

    // If no open schedule is found for this day, consider it closed
    if (!foundOpenSchedule) {
        return { earliestTime: null, latestTime: null };
    }

    return { earliestTime, latestTime };
}
