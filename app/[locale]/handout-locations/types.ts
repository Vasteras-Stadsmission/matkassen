import {
    handoutLocations,
    handoutLocationSchedules,
    handoutLocationScheduleDays,
} from "@/app/db/schema";
import { weekdayEnum } from "@/app/db/schema";
import { InferSelectModel } from "drizzle-orm";

// Define base types from the database schema
export type HandoutLocation = InferSelectModel<typeof handoutLocations>;

// New types for schedule-based opening hours
export type HandoutLocationSchedule = InferSelectModel<typeof handoutLocationSchedules>;
export type HandoutLocationScheduleDay = InferSelectModel<typeof handoutLocationScheduleDays>;

// Weekday type from enum
export type Weekday = (typeof weekdayEnum.enumValues)[number];

// Combined type for location with its schedules (new approach)
export interface HandoutLocationWithSchedules extends HandoutLocation {
    schedules: HandoutLocationScheduleWithDays[];
}

// Combined type for a schedule with its days
export interface HandoutLocationScheduleWithDays extends HandoutLocationSchedule {
    days: HandoutLocationScheduleDay[];
}

// Combined type with location data
export interface HandoutLocationWithAllData extends HandoutLocation {
    schedules: HandoutLocationScheduleWithDays[];
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
