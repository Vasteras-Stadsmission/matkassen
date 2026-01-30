/**
 * Shared types for the schedule module
 * This file contains types that can be imported by both client and server components
 */

/**
 * Unified parcel display status used across the application.
 * - upcoming: Future parcel, not yet picked up
 * - pickedUp: Parcel has been collected
 * - notPickedUp: Past parcel that was never picked up (and not marked as no-show)
 * - noShow: Household was marked as no-show
 * - cancelled: Parcel was cancelled/deleted
 */
export type ParcelDisplayStatus = "upcoming" | "pickedUp" | "notPickedUp" | "noShow" | "cancelled";

export interface FoodParcel {
    id: string;
    householdId: string;
    householdName: string;
    pickupDate: Date;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
    isPickedUp: boolean;
    noShowAt?: Date | null; // Timestamp when parcel was marked as no-show
    pickup_location_id?: string; // Database column name (snake_case)
    locationId?: string; // Alternative naming for the location ID
}

export interface PickupLocation {
    id: string;
    name: string;
    street_address: string;
    maxParcelsPerDay: number | null;
    maxParcelsPerSlot: number | null;
    outsideHoursCount: number;
    hasUpcomingSchedule: boolean;
}

/**
 * Interface for pickup location schedule information
 */
export interface LocationScheduleDay {
    weekday: string;
    isOpen: boolean;
    openingTime: string | null;
    closingTime: string | null;
}

export interface LocationSchedule {
    id: string;
    name: string;
    startDate: string | Date; // Can be either string or Date to handle DB and UI formats
    endDate: string | Date; // Can be either string or Date to handle DB and UI formats
    days: LocationScheduleDay[];
}

export interface LocationScheduleInfo {
    schedules: LocationSchedule[];
}

// Define interfaces for the time slot grid
export interface DayInfo {
    date: Date;
    isAvailable: boolean;
    unavailableReason?: string;
}

export interface TimeSlotGridData {
    days: DayInfo[];
    timeslots: string[];
}
