/**
 * Utility functions for filtering parcels that are outside opening hours
 * This module is designed to be pure and testable, with no database dependencies
 */

import { Time } from "@/app/utils/time-provider";
import { isTimeAvailable } from "./location-availability";

export interface ParcelTimeInfo {
    id: string;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
    isPickedUp: boolean;
}

export interface LocationScheduleInfo {
    schedules: Array<{
        id: string;
        name: string;
        startDate: string | Date;
        endDate: string | Date;
        days: Array<{
            weekday: string;
            isOpen: boolean;
            openingTime: string | null;
            closingTime: string | null;
        }>;
    }>;
}

/**
 * Determines if a parcel is considered "future" based on its earliest pickup time
 * A parcel is future if its earliest pickup time is after the current time
 */
export function isFutureParcel(parcel: ParcelTimeInfo, currentTime: Date = new Date()): boolean {
    return parcel.pickupEarliestTime > currentTime;
}

/**
 * Determines if a parcel is active (not picked up and in the future)
 */
export function isActiveParcel(parcel: ParcelTimeInfo, currentTime: Date = new Date()): boolean {
    return !parcel.isPickedUp && isFutureParcel(parcel, currentTime);
}

/**
 * Determines if a parcel's time slot is outside opening hours
 * Returns true if the parcel is outside opening hours, false if it's within hours
 */
export function isParcelOutsideOpeningHours(
    parcel: ParcelTimeInfo,
    locationSchedules: LocationScheduleInfo,
): boolean {
    const startLocal = Time.fromDate(parcel.pickupEarliestTime);
    const endLocal = Time.fromDate(parcel.pickupLatestTime);

    // Format times for checking availability
    const startTime = startLocal.toTimeString();
    const endTime = endLocal.toTimeString();

    try {
        // Check if start time is within opening hours
        const startAvailability = isTimeAvailable(
            startLocal.toDate(),
            startTime,
            locationSchedules,
        );

        // Check if end time is within opening hours as well
        let endAvailability = isTimeAvailable(endLocal.toDate(), endTime, locationSchedules);

        // Align with grid logic: a slot that ends exactly at closing time is considered valid.
        // If the end check failed, but the end HH:mm equals the day's closing time, treat it as available.
        const closingTimeForDay = getClosingTimeForDate(startLocal.toDate(), locationSchedules);
        if (!endAvailability.isAvailable && closingTimeForDay && closingTimeForDay !== null) {
            // Normalize time formats for comparison (remove seconds if present)
            const normalizedClosingTime = closingTimeForDay.substring(0, 5); // "20:00:00" -> "20:00"
            const normalizedEndTime = endTime.substring(0, 5); // Already "20:00" but just to be safe
            if (normalizedClosingTime === normalizedEndTime) {
                endAvailability = { isAvailable: true };
            }
        }

        const isWithinHours = startAvailability.isAvailable && endAvailability.isAvailable;
        return !isWithinHours;
    } catch (error) {
        console.error(`Error checking time availability for parcel ${parcel.id}:`, error);
        // If there's an error checking availability, treat as outside hours to be safe
        return true;
    }
}

/**
 * Find the latest closing time (HH:mm) for the given date from the provided schedules.
 * We intentionally avoid importing other helpers to keep tests (which mock isTimeAvailable only)
 * working; this derives the day config directly from the schedules object.
 */
function getClosingTimeForDate(localDate: Date, scheduleInfo: LocationScheduleInfo): string | null {
    const weekdayIndex = localDate.getDay(); // 0=Sun..6=Sat in local time (already Stockholm)
    const weekdayName = [
        "sunday",
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
    ][weekdayIndex];

    let latestClosing: string | null = null;
    const schedules = scheduleInfo?.schedules ?? [];
    for (const schedule of schedules) {
        const dayConfig = schedule.days.find(d => d.weekday === weekdayName);
        if (!dayConfig || !dayConfig.isOpen || !dayConfig.closingTime) continue;
        // Track the most permissive (latest) closing time
        if (!latestClosing || dayConfig.closingTime > latestClosing) {
            latestClosing = dayConfig.closingTime;
        }
    }
    return latestClosing;
}

/**
 * Filters a list of parcels to only include those that are:
 * 1. Active (not picked up and in the future)
 * 2. Outside opening hours according to the location schedule
 */
export function filterOutsideHoursParcels(
    parcels: ParcelTimeInfo[],
    locationSchedules: LocationScheduleInfo,
    currentTime: Date = new Date(),
): ParcelTimeInfo[] {
    return parcels.filter(parcel => {
        // First check if the parcel is active
        if (!isActiveParcel(parcel, currentTime)) {
            return false;
        }

        // Then check if it's outside opening hours
        return isParcelOutsideOpeningHours(parcel, locationSchedules);
    });
}

/**
 * Counts parcels that are outside opening hours
 */
export function countOutsideHoursParcels(
    parcels: ParcelTimeInfo[],
    locationSchedules: LocationScheduleInfo,
    currentTime: Date = new Date(),
): number {
    return filterOutsideHoursParcels(parcels, locationSchedules, currentTime).length;
}

/**
 * Filters parcels to only include active ones (not picked up and in the future)
 */
export function filterActiveParcels(
    parcels: ParcelTimeInfo[],
    currentTime: Date = new Date(),
): ParcelTimeInfo[] {
    return parcels.filter(parcel => isActiveParcel(parcel, currentTime));
}

/**
 * Determines if a parcel would be affected by a schedule change
 * A parcel is affected if it's currently within hours but would be outside hours with the new schedule
 */
export function isParcelAffectedByScheduleChange(
    parcel: ParcelTimeInfo,
    currentSchedule: LocationScheduleInfo,
    proposedSchedule: LocationScheduleInfo,
    currentTime: Date = new Date(),
): boolean {
    // Only consider active parcels
    if (!isActiveParcel(parcel, currentTime)) {
        return false;
    }

    const isCurrentlyOutside = isParcelOutsideOpeningHours(parcel, currentSchedule);
    const wouldBeOutside = isParcelOutsideOpeningHours(parcel, proposedSchedule);

    // A parcel is affected if it would become outside hours when it's currently within hours
    return !isCurrentlyOutside && wouldBeOutside;
}

/**
 * Counts how many parcels would be affected by a schedule change
 */
export function countParcelsAffectedByScheduleChange(
    parcels: ParcelTimeInfo[],
    currentSchedule: LocationScheduleInfo,
    proposedSchedule: LocationScheduleInfo,
    currentTime: Date = new Date(),
): number {
    return parcels.filter(parcel =>
        isParcelAffectedByScheduleChange(parcel, currentSchedule, proposedSchedule, currentTime),
    ).length;
}
