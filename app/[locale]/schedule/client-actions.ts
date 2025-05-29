"use client";

import { type LocationScheduleInfo, type TimeSlotGridData } from "./actions";

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
        // Use dynamic import to avoid bundling server code in client components
        const { updateFoodParcelSchedule } = await import("./actions");
        return updateFoodParcelSchedule(parcelId, newTimeslot);
    } catch (error) {
        console.error("Error calling updateFoodParcelSchedule:", error);
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
        const { getPickupLocationSchedules } = await import("./actions");
        return getPickupLocationSchedules(locationId);
    } catch (error) {
        console.error("Error fetching location schedules:", error);
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
        const { getLocationSlotDuration } = await import("./actions");
        return getLocationSlotDuration(locationId);
    } catch (error) {
        console.error("Error fetching location slot duration:", error);
        // Default to 15 minutes in case of error
        return 15;
    }
}

/**
 * Client wrapper for getting time slot grid
 */
export async function getTimeSlotGridAction(
    locationId: string,
    week: Date[],
): Promise<TimeSlotGridData> {
    try {
        const { getTimeSlotGrid } = await import("./actions");
        return getTimeSlotGrid(locationId, week);
    } catch (error) {
        console.error("Error generating time slot grid:", error);
        throw error;
    }
}

/**
 * Client wrapper for getting location with schedules
 */
export async function getLocationWithSchedulesAction(
    locationId: string,
): Promise<LocationScheduleInfo> {
    try {
        const { getLocationWithSchedules } = await import("./actions");
        return getLocationWithSchedules(locationId);
    } catch (error) {
        console.error("Error fetching location with schedules:", error);
        return {
            schedules: [],
        };
    }
}
