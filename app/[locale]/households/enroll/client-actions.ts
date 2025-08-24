"use client";

import type { PickupLocation, LocationCapacity } from "./types";
import {
    getPickupLocations,
    getPickupLocationSchedules,
    getPickupLocationCapacityForRange,
} from "./actions";
import { getLocationSlotDuration } from "@/app/[locale]/schedule/actions";
import { type LocationScheduleInfo } from "@/app/[locale]/schedule/types";

/**
 * Client wrapper for getting pickup locations
 */
export async function getPickupLocationsAction(): Promise<PickupLocation[]> {
    try {
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
): Promise<LocationScheduleInfo> {
    try {
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
        return getLocationSlotDuration(locationId);
    } catch (error) {
        console.error("Error fetching location slot duration:", error);
        // Default to 15 minutes in case of error
        return 15;
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
        return getPickupLocationCapacityForRange(locationId, startDate, endDate);
    } catch (error) {
        console.error("Error fetching location capacity:", error);
        return null;
    }
}
