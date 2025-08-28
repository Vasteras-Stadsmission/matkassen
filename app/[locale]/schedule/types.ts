/**
 * Shared types for the schedule module
 * This file contains types that can be imported by both client and server components
 */

export interface FoodParcel {
    id: string;
    householdId: string;
    householdName: string;
    pickupDate: Date;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
    isPickedUp: boolean;
    pickup_location_id?: string; // Optional for backward compatibility
    locationId?: string; // Alternative naming for the location ID
}

export interface PickupLocation {
    id: string;
    name: string;
    street_address: string;
    maxParcelsPerDay: number | null;
    outsideHoursCount: number;
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
