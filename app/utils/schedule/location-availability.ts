/**
 * Schedule utility functions for location availability validation
 */
import { toStockholmTime } from "@/app/utils/date-utils";
import { LocationScheduleInfo } from "@/app/[locale]/schedule/actions";

/**
 * Check if a date is available according to location schedules
 */
export function isDateAvailable(
    date: Date,
    scheduleInfo: LocationScheduleInfo,
): {
    isAvailable: boolean;
    message?: string;
    openingTime?: string;
    closingTime?: string;
} {
    // Convert date to Stockholm time to ensure consistent timezone handling
    const stockholmDate = toStockholmTime(date);
    const dayOfWeek = stockholmDate.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Get the weekday name
    const weekdayName = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ][dayOfWeek];

    // Check all schedules for this date
    for (const schedule of scheduleInfo.schedules) {
        const startDate = new Date(schedule.startDate);
        const endDate = new Date(schedule.endDate);

        // Skip schedules that don't include this date
        if (date < startDate || date > endDate) {
            continue;
        }

        // Find day configuration for this weekday
        const dayConfig = schedule.days.find(day => day.weekday === weekdayName);

        if (dayConfig) {
            return {
                isAvailable: dayConfig.isOpen,
                message: dayConfig.isOpen ? "" : "Closed on this day",
                openingTime: dayConfig.openingTime ?? undefined,
                closingTime: dayConfig.closingTime ?? undefined,
            };
        }
    }

    // If no schedule is found for this day, consider it closed
    return {
        isAvailable: false,
        message: "No scheduled hours",
        openingTime: undefined,
        closingTime: undefined,
    };
}

/**
 * Check if a specific time is available on a given date
 */
export function isTimeAvailable(
    date: Date,
    time: string,
    scheduleInfo: LocationScheduleInfo,
): { isAvailable: boolean; message?: string } {
    // First check if date is available at all
    const dateAvailability = isDateAvailable(date, scheduleInfo);
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
    if (timeValue < openValue || timeValue >= closeValue) {
        return {
            isAvailable: false,
            message: `This location is only open from ${openingTime} to ${closingTime} on this day`,
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
    const stockholmDate = toStockholmTime(date);
    const dayOfWeek = stockholmDate.getDay(); // 0 = Sunday, 1 = Monday, ...

    // Get the weekday name
    const weekdayName = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ][dayOfWeek];

    // Check all schedules for this date
    for (const schedule of locationSchedule.schedules) {
        const startDate = new Date(schedule.startDate);
        const endDate = new Date(schedule.endDate);

        // Skip schedules that don't include this date
        if (date < startDate || date > endDate) {
            continue;
        }

        // Find day configuration for this weekday
        const dayConfig = schedule.days.find(day => day.weekday === weekdayName);

        if (dayConfig) {
            if (!dayConfig.isOpen) {
                return { earliestTime: null, latestTime: null };
            }
            return {
                earliestTime: dayConfig.openingTime,
                latestTime: dayConfig.closingTime,
            };
        }
    }

    // If no schedule is found for this day, consider it closed
    return { earliestTime: null, latestTime: null };
}
