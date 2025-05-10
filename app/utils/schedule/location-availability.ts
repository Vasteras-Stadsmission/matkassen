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

    // Adjust weekday mapping to match our database enum
    // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
    // Database weekdayEnum: monday, tuesday, ..., sunday
    const weekdayName = [
        "sunday", // JS: 0
        "monday", // JS: 1
        "tuesday", // JS: 2
        "wednesday", // JS: 3
        "thursday", // JS: 4
        "friday", // JS: 5
        "saturday", // JS: 6
    ][dayOfWeek];

    // Check if we should show debug logs (only for development and for Week 21)
    const isWeek21 = date >= new Date("2025-05-19") && date <= new Date("2025-05-25");
    const shouldDebug = process.env.NODE_ENV !== "production" && isWeek21;

    if (shouldDebug) {
        console.log(
            `%c[Check for Week 21] ${date.toISOString()} (${weekdayName})`,
            "background: #f44336; color: white; padding: 2px 4px; font-weight: bold",
        );
        console.log("Schedules to check:", scheduleInfo.schedules.length);
    }

    // Track the most "permissive" schedule (prioritize open over closed)
    let bestSchedule: {
        isAvailable: boolean;
        message?: string;
        openingTime?: string;
        closingTime?: string;
    } = {
        isAvailable: false,
        message: "No scheduled hours",
    };

    // Check all schedules for this date
    for (const schedule of scheduleInfo.schedules) {
        const startDate = new Date(schedule.startDate);
        const endDate = new Date(schedule.endDate);

        // For debugging
        if (shouldDebug) {
            console.log(
                `Checking schedule ${schedule.name}: ${startDate.toISOString()} - ${endDate.toISOString()}`,
            );
            console.log(
                `Date to check (${date.toISOString()}) in range? ${date >= startDate && date <= endDate}`,
            );
        }

        // Skip schedules that don't include this date
        if (date < startDate || date > endDate) {
            continue;
        }

        if (shouldDebug) {
            console.log(`Found matching schedule: ${schedule.name}`);
        }

        // Find day configuration for this weekday
        const dayConfig = schedule.days.find(day => day.weekday === weekdayName);

        if (shouldDebug) {
            console.log(`Day config for ${weekdayName}:`, dayConfig || "NOT FOUND");
            if (dayConfig) {
                console.log(`Is open: ${dayConfig.isOpen ? "YES" : "NO"}`);
            }
        }

        if (dayConfig) {
            // If we find an open schedule, prioritize it over closed ones
            if (dayConfig.isOpen) {
                if (shouldDebug) {
                    console.log(
                        `%c${weekdayName} is OPEN: ${dayConfig.openingTime} - ${dayConfig.closingTime}`,
                        "background: #4caf50; color: white; padding: 2px 4px; font-weight: bold",
                    );
                }
                return {
                    isAvailable: true,
                    message: "",
                    openingTime: dayConfig.openingTime ?? undefined,
                    closingTime: dayConfig.closingTime ?? undefined,
                };
            } else if (!bestSchedule.isAvailable) {
                // Only update if we haven't found an open schedule yet
                if (shouldDebug) {
                    console.log(`${weekdayName} is CLOSED in this schedule`);
                }
                bestSchedule = {
                    isAvailable: false,
                    message: "Closed on this day",
                    openingTime: dayConfig.openingTime ?? undefined,
                    closingTime: dayConfig.closingTime ?? undefined,
                };
            }
        }
    }

    // Return the best schedule we found, or the default "no schedule" response
    if (shouldDebug) {
        console.log(
            `%cFinal result for ${weekdayName}: ${bestSchedule.isAvailable ? "AVAILABLE" : "NOT AVAILABLE"}`,
            "background: #ff9800; color: black; padding: 2px 4px; font-weight: bold",
        );
    }
    return bestSchedule;
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

    // Use the same weekday mapping as isDateAvailable
    // JavaScript: 0=Sunday, 1=Monday, ..., 6=Saturday
    // Database: monday, tuesday, ..., sunday
    const weekdayName = [
        "sunday", // JS: 0
        "monday", // JS: 1
        "tuesday", // JS: 2
        "wednesday", // JS: 3
        "thursday", // JS: 4
        "friday", // JS: 5
        "saturday", // JS: 6
    ][dayOfWeek];

    // For debugging purposes
    if (process.env.NODE_ENV !== "production") {
        console.log(
            `[getAvailableTimeRange] Checking date ${date.toISOString()}, weekday: ${weekdayName}`,
        );
        console.log(
            `[getAvailableTimeRange] Number of schedules: ${locationSchedule.schedules.length}`,
        );
    }

    // Track if we found any open schedule
    let foundOpenSchedule = false;
    let earliestTime: string | null = null;
    let latestTime: string | null = null;

    // Check all schedules for this date
    for (const schedule of locationSchedule.schedules) {
        const startDate = new Date(schedule.startDate);
        const endDate = new Date(schedule.endDate);

        // For debugging
        if (process.env.NODE_ENV !== "production") {
            console.log(
                `[getAvailableTimeRange] Checking schedule ${schedule.name} (${startDate.toISOString()} to ${endDate.toISOString()})`,
            );
        }

        // Skip schedules that don't include this date
        if (date < startDate || date > endDate) {
            if (process.env.NODE_ENV !== "production") {
                console.log(`[getAvailableTimeRange] Date outside range, skipping`);
            }
            continue;
        }

        if (process.env.NODE_ENV !== "production") {
            console.log(`[getAvailableTimeRange] Date in range of schedule ${schedule.name}`);
        }

        // Find day configuration for this weekday
        const dayConfig = schedule.days.find(day => day.weekday === weekdayName);

        if (process.env.NODE_ENV !== "production") {
            console.log(
                `[getAvailableTimeRange] Day config for ${weekdayName}: ${dayConfig ? JSON.stringify(dayConfig) : "not found"}`,
            );
        }

        if (dayConfig && dayConfig.isOpen) {
            // Found an open schedule
            foundOpenSchedule = true;

            if (process.env.NODE_ENV !== "production") {
                console.log(
                    `[getAvailableTimeRange] Day is OPEN: ${dayConfig.openingTime} - ${dayConfig.closingTime}`,
                );
            }

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
        if (process.env.NODE_ENV !== "production") {
            console.log(`[getAvailableTimeRange] No open schedule found for this day`);
        }
        return { earliestTime: null, latestTime: null };
    }

    if (process.env.NODE_ENV !== "production") {
        console.log(`[getAvailableTimeRange] Final time range: ${earliestTime} - ${latestTime}`);
    }
    return { earliestTime, latestTime };
}
