import { getTestDb } from "../db/test-db";
import {
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
} from "@/app/db/schema";

let locationCounter = 0;

/**
 * Reset the location counter. Call this in beforeEach if needed.
 */
export function resetLocationCounter() {
    locationCounter = 0;
}

/**
 * Create a test pickup location with default values.
 */
export async function createTestPickupLocation(
    overrides: Partial<typeof pickupLocations.$inferInsert> = {},
) {
    const db = await getTestDb();
    locationCounter++;

    const defaults: typeof pickupLocations.$inferInsert = {
        name: `Test Location ${locationCounter}`,
        street_address: `Test Street ${locationCounter}`,
        postal_code: "72345",
        default_slot_duration_minutes: 15,
        max_parcels_per_slot: 4,
    };

    const [location] = await db
        .insert(pickupLocations)
        .values({ ...defaults, ...overrides })
        .returning();

    return location;
}

/**
 * Create a pickup location with an active schedule.
 * Schedule is valid from today for 30 days, open Mon-Fri 9-17.
 */
export async function createTestLocationWithSchedule(
    locationOverrides: Partial<typeof pickupLocations.$inferInsert> = {},
    scheduleOptions: {
        startDate?: Date;
        endDate?: Date;
        weekdays?: Array<
            "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday"
        >;
        openingTime?: string;
        closingTime?: string;
    } = {},
) {
    const location = await createTestPickupLocation(locationOverrides);
    const db = await getTestDb();

    // Create a schedule valid for next 30 days by default
    const startDate = scheduleOptions.startDate ?? new Date();
    const endDate = scheduleOptions.endDate ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [schedule] = await db
        .insert(pickupLocationSchedules)
        .values({
            pickup_location_id: location.id,
            start_date: startDate.toISOString().split("T")[0],
            end_date: endDate.toISOString().split("T")[0],
            name: "Test Schedule",
        })
        .returning();

    // Add weekday hours (default: Mon-Fri 9-17)
    const weekdays = scheduleOptions.weekdays ?? [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
    ];
    const openingTime = scheduleOptions.openingTime ?? "09:00";
    const closingTime = scheduleOptions.closingTime ?? "17:00";

    if (weekdays.length > 0) {
        await db.insert(pickupLocationScheduleDays).values(
            weekdays.map(day => ({
                schedule_id: schedule.id,
                weekday: day,
                is_open: true,
                opening_time: openingTime,
                closing_time: closingTime,
            })),
        );
    }

    return { location, schedule };
}

/**
 * Create a pickup location with a custom schedule for specific dates.
 * Useful for testing edge cases around schedule boundaries.
 */
export async function createTestLocationWithCustomSchedule(
    locationOverrides: Partial<typeof pickupLocations.$inferInsert> = {},
    scheduleConfig: {
        name: string;
        startDate: string; // YYYY-MM-DD format
        endDate: string;
        days: Array<{
            weekday:
                | "monday"
                | "tuesday"
                | "wednesday"
                | "thursday"
                | "friday"
                | "saturday"
                | "sunday";
            is_open: boolean;
            opening_time?: string;
            closing_time?: string;
        }>;
    },
) {
    const location = await createTestPickupLocation(locationOverrides);
    const db = await getTestDb();

    const [schedule] = await db
        .insert(pickupLocationSchedules)
        .values({
            pickup_location_id: location.id,
            start_date: scheduleConfig.startDate,
            end_date: scheduleConfig.endDate,
            name: scheduleConfig.name,
        })
        .returning();

    if (scheduleConfig.days.length > 0) {
        await db.insert(pickupLocationScheduleDays).values(
            scheduleConfig.days.map(day => ({
                schedule_id: schedule.id,
                weekday: day.weekday,
                is_open: day.is_open,
                opening_time: day.is_open ? day.opening_time : null,
                closing_time: day.is_open ? day.closing_time : null,
            })),
        );
    }

    return { location, schedule };
}
