"use client";

import {
    updateFoodParcelSchedule,
    getPickupLocationSchedules,
    getLocationSlotDuration,
    recomputeOutsideHoursCount,
} from "./actions";
import type { LocationScheduleInfo } from "./types";
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
): Promise<{ success: boolean; error?: string }> {
    try {
        const result = await updateFoodParcelSchedule(parcelId, newTimeslot);
        if (!result.success) {
            return {
                success: false,
                error: result.error.message,
            };
        }
        return { success: true };
    } catch (error) {
        logError("Error calling updateFoodParcelSchedule", error, { parcelId });
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
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
        return getPickupLocationSchedules(locationId);
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
        return getLocationSlotDuration(locationId);
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
        return recomputeOutsideHoursCount(locationId);
    } catch (error) {
        logError("Error recomputing outside-hours count", error, { locationId });
        return 0;
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
        return checkParcelsAffectedByScheduleDeletion(locationId, scheduleToDelete);
    } catch (error) {
        logError("Error checking parcels affected by schedule deletion", error, { locationId });
        return 0;
    }
}
