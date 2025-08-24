import {
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
} from "@/app/db/schema";
import { weekdayEnum } from "@/app/db/schema";
import { InferSelectModel } from "drizzle-orm";

// Define base types from the database schema
export type PickupLocation = InferSelectModel<typeof pickupLocations>;

// New types for schedule-based opening hours
export type PickupLocationSchedule = InferSelectModel<typeof pickupLocationSchedules>;
export type PickupLocationScheduleDay = InferSelectModel<typeof pickupLocationScheduleDays>;

// Weekday type from enum
export type Weekday = (typeof weekdayEnum.enumValues)[number];

// Combined type for location with its schedules (new approach)
export interface PickupLocationWithSchedules extends PickupLocation {
    schedules: PickupLocationScheduleWithDays[];
}

// Combined type for a schedule with its days
export interface PickupLocationScheduleWithDays extends PickupLocationSchedule {
    days: PickupLocationScheduleDay[];
}

// Combined type with location data
export interface PickupLocationWithAllData extends PickupLocation {
    schedules: PickupLocationScheduleWithDays[];
}

// Form input types
export interface LocationFormInput {
    name: string;
    street_address: string;
    postal_code: string;
    parcels_max_per_day: number | null;
    contact_name: string;
    contact_email: string | null;
    contact_phone_number: string;
    default_slot_duration_minutes: number;
}

// New input types for schedule-based approach
export interface ScheduleInput {
    name: string;
    start_date: Date;
    end_date: Date;
    days: ScheduleDayInput[];
}

export interface ScheduleDayInput {
    weekday: Weekday;
    is_open: boolean;
    opening_time?: string;
    closing_time?: string;
}

// Interface representing a week number selection
export interface WeekSelection {
    year: number;
    week: number;
}

// Helper interface for schedule validation
export interface ScheduleDateRange {
    id?: string;
    start_date: Date;
    end_date: Date;
}

// Types for schedule-based approach
export interface LocationSchedules {
    schedules: LocationSchedule[];
}

export interface LocationSchedule {
    id: string;
    name: string;
    startDate: Date;
    endDate: Date;
    days: {
        weekday: string;
        isOpen: boolean;
        openingTime: string | null;
        closingTime: string | null;
    }[];
}
