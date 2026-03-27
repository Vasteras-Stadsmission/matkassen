"use client";

import {
    updateFoodParcelSchedule,
    getPickupLocationSchedules,
    getLocationSlotDuration,
    recomputeOutsideHoursCount,
    bulkRescheduleParcels,
    getOutsideHoursParcelsForLocation,
    getFullyBookedDates,
} from "./actions";
import type { FoodParcel, LocationScheduleInfo } from "./types";
import { logError } from "@/app/utils/logger";

/**
 * Client wrapper for updating a food parcel schedule
 */
export async function updateFoodParcelScheduleAction(
    parcelId: string,
    newTimeslot: {
        date: Date;
        startTime: Date;
        endTime: Date;
    },
): Promise<{ success: boolean; error?: string; errorCode?: string }> {
    try {
        const result = await updateFoodParcelSchedule(parcelId, newTimeslot);
        if (!result.success) {
            return {
                success: false,
                error: result.error.message,
                errorCode: result.error.code,
            };
        }
        return { success: true };
    } catch (error) {
        logError("Error calling updateFoodParcelSchedule", error, { parcelId });
        return {
            success: false,
            // Return error code for i18n translation by caller
            errorCode: "UNKNOWN_ERROR",
            error: error instanceof Error ? error.message : undefined,
        };
    }
}

/**
 * Client wrapper for getting pickup location schedules
 */
export async function getPickupLocationSchedulesAction(
    locationId: string,
): Promise<LocationScheduleInfo> {
    try {
        return await getPickupLocationSchedules(locationId);
    } catch (error) {
        logError("Error fetching location schedules", error, { locationId });
        return {
            schedules: [],
        };
    }
}

/**
 * Client wrapper for getting location slot duration
 */
export async function getLocationSlotDurationAction(locationId: string): Promise<number> {
    try {
        return await getLocationSlotDuration(locationId);
    } catch (error) {
        logError("Error fetching location slot duration", error, { locationId });
        // Default to 15 minutes in case of error
        return 15;
    }
}

/**
 * Trigger recomputation of outside-hours count for a location (server-side)
 */
export async function recomputeOutsideHoursCountAction(locationId: string): Promise<number> {
    try {
        return await recomputeOutsideHoursCount(locationId);
    } catch (error) {
        logError("Error recomputing outside-hours count", error, { locationId });
        return 0;
    }
}

/**
 * Client wrapper for bulk rescheduling parcels
 */
export async function bulkRescheduleParcelsAction(
    parcelIds: string[],
    newTimeslot: { startTime: Date },
): Promise<{ success: boolean; count?: number; error?: string; errorCode?: string }> {
    try {
        const result = await bulkRescheduleParcels(parcelIds, newTimeslot);
        if (!result.success) {
            return {
                success: false,
                error: result.error.message,
                errorCode: result.error.code,
            };
        }
        return { success: true, count: result.data.count };
    } catch (error) {
        logError("Error calling bulkRescheduleParcels", error, { parcelIds });
        return {
            success: false,
            errorCode: "UNKNOWN_ERROR",
            error: error instanceof Error ? error.message : undefined,
        };
    }
}

/**
 * Client wrapper for getting all future outside-hours parcels for a location
 */
export async function getOutsideHoursParcelsAction(locationId: string): Promise<FoodParcel[]> {
    try {
        return await getOutsideHoursParcelsForLocation(locationId);
    } catch (error) {
        logError("Error fetching outside-hours parcels", error, { locationId });
        return [];
    }
}

/**
 * Client wrapper for getting fully booked dates for a location
 */
export async function getFullyBookedDatesAction(
    locationId: string,
    startDate: Date,
    endDate: Date,
): Promise<string[]> {
    try {
        return await getFullyBookedDates(locationId, startDate, endDate);
    } catch (error) {
        logError("Error fetching fully booked dates", error, { locationId });
        return [];
    }
}

/**
 * Check how many parcels would be affected by schedule deletion (client-accessible)
 */
export async function checkParcelsAffectedByScheduleDeletionAction(
    locationId: string,
    scheduleToDelete: {
        id: string;
        start_date: Date;
        end_date: Date;
        days: Array<{
            weekday: string;
            is_open: boolean;
            opening_time?: string;
            closing_time?: string;
        }>;
    },
): Promise<number> {
    try {
        const { checkParcelsAffectedByScheduleDeletion } = await import("./actions");
        return await checkParcelsAffectedByScheduleDeletion(locationId, scheduleToDelete);
    } catch (error) {
        logError("Error checking parcels affected by schedule deletion", error, { locationId });
        return 0;
    }
}
