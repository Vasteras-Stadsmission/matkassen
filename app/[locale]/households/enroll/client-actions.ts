"use client";

import type { PickupLocation, LocationCapacity } from "./types";

/**
 * Client wrapper for getting pickup locations
 */
export async function getPickupLocationsAction(): Promise<PickupLocation[]> {
    try {
        const { getPickupLocations } = await import("./actions");
        return getPickupLocations();
    } catch (error) {
        console.error("Error fetching pickup locations:", error);
        return [];
    }
}

/**
 * Client wrapper for getting pickup location schedules
 */
export async function getPickupLocationSchedulesAction(
    locationId: string,
): Promise<{ schedules: unknown[] }> {
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
 * Client wrapper for getting pickup location capacity for a date range
 */
export async function getPickupLocationCapacityForRangeAction(
    locationId: string,
    startDate: Date,
    endDate: Date,
): Promise<LocationCapacity | null> {
    try {
        const { getPickupLocationCapacityForRange } = await import("./actions");
        return getPickupLocationCapacityForRange(locationId, startDate, endDate);
    } catch (error) {
        console.error("Error fetching location capacity:", error);
        return null;
    }
}
