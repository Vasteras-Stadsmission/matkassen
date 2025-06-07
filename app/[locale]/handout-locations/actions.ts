"use server";

import { db } from "@/app/db/drizzle";
import {
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
} from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import {
    LocationFormInput,
    PickupLocationWithAllData,
    ScheduleInput,
    PickupLocationScheduleWithDays,
} from "./types";

// Get all locations with their schedules
export async function getLocations(): Promise<PickupLocationWithAllData[]> {
    try {
        // Fetch all locations
        const locations = await db.select().from(pickupLocations);

        // For each location, fetch the related data
        const locationsWithSchedules = await Promise.all(
            locations.map(async location => {
                // Fetch schedules
                const schedules = await db
                    .select()
                    .from(pickupLocationSchedules)
                    .where(eq(pickupLocationSchedules.pickup_location_id, location.id));

                // For each schedule, fetch the related days
                const schedulesWithDays = await Promise.all(
                    schedules.map(async schedule => {
                        const days = await db
                            .select()
                            .from(pickupLocationScheduleDays)
                            .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

                        return {
                            ...schedule,
                            days,
                        };
                    }),
                );

                // Return location with related data
                return {
                    ...location,
                    schedules: schedulesWithDays,
                };
            }),
        );

        return locationsWithSchedules;
    } catch (error) {
        console.error("Error fetching locations:", error);
        // Re-throw to let client handle error
        throw new Error(
            `Failed to fetch locations: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// Get a single location with schedules by ID
export async function getLocation(id: string): Promise<PickupLocationWithAllData | null> {
    try {
        // Fetch the location
        const location = await db
            .select()
            .from(pickupLocations)
            .where(eq(pickupLocations.id, id))
            .then(res => res[0] || null);

        if (!location) {
            return null;
        }

        // Fetch schedules
        const schedules = await db
            .select()
            .from(pickupLocationSchedules)
            .where(eq(pickupLocationSchedules.pickup_location_id, id));

        // For each schedule, fetch the related days
        const schedulesWithDays = await Promise.all(
            schedules.map(async schedule => {
                const days = await db
                    .select()
                    .from(pickupLocationScheduleDays)
                    .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

                return {
                    ...schedule,
                    days,
                };
            }),
        );

        // Return location with related data
        return {
            ...location,
            schedules: schedulesWithDays,
        };
    } catch (error) {
        console.error(`Error fetching location with ID ${id}:`, error);
        throw new Error(
            `Failed to fetch location: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// Create a new location
export async function createLocation(locationData: LocationFormInput): Promise<void> {
    try {
        // Process email to ensure it's either null or a valid format
        const contact_email = locationData.contact_email?.trim()
            ? locationData.contact_email.trim()
            : null;

        // Insert the location
        await db.insert(pickupLocations).values({
            name: locationData.name,
            street_address: locationData.street_address,
            postal_code: locationData.postal_code,
            parcels_max_per_day: locationData.parcels_max_per_day,
            contact_name: locationData.contact_name,
            contact_email: contact_email, // Use processed email value
            contact_phone_number: locationData.contact_phone_number,
            default_slot_duration_minutes: locationData.default_slot_duration_minutes,
        });

        // Get the current locale from headers
        const locale = (await headers()).get("x-locale") || "en";

        // Revalidate the path to update the UI
        revalidatePath(`/${locale}/handout-locations`, "page");
    } catch (error) {
        console.error("Error creating location:", error);
        throw new Error(
            `Failed to create location: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// Update an existing location
export async function updateLocation(id: string, locationData: LocationFormInput): Promise<void> {
    try {
        // Process email to ensure it's either null or a valid format
        const contact_email = locationData.contact_email?.trim()
            ? locationData.contact_email.trim()
            : null;

        // Update the location
        await db
            .update(pickupLocations)
            .set({
                name: locationData.name,
                street_address: locationData.street_address,
                postal_code: locationData.postal_code,
                parcels_max_per_day: locationData.parcels_max_per_day,
                contact_name: locationData.contact_name,
                contact_email: contact_email, // Use processed email value
                contact_phone_number: locationData.contact_phone_number,
                default_slot_duration_minutes: locationData.default_slot_duration_minutes,
            })
            .where(eq(pickupLocations.id, id));

        // Get the current locale from headers
        const locale = (await headers()).get("x-locale") || "en";

        // Revalidate the path to update the UI
        revalidatePath(`/${locale}/handout-locations`, "page");
    } catch (error) {
        console.error(`Error updating location with ID ${id}:`, error);
        throw new Error(
            `Failed to update location: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// Delete a location
export async function deleteLocation(id: string): Promise<void> {
    try {
        // Delete the location (cascade will delete related records)
        await db.delete(pickupLocations).where(eq(pickupLocations.id, id));

        // Get the current locale from headers
        const locale = (await headers()).get("x-locale") || "en";

        // Revalidate the path to update the UI
        revalidatePath(`/${locale}/handout-locations`, "page");
    } catch (error) {
        console.error(`Error deleting location with ID ${id}:`, error);
        throw new Error(
            `Failed to delete location: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// Create a new schedule for a location
export async function createSchedule(
    locationId: string,
    scheduleData: ScheduleInput,
): Promise<PickupLocationScheduleWithDays> {
    try {
        // Validate schedule overlap using shared utility
        const { validateScheduleOverlap } = await import("@/app/utils/schedule/overlap-validation");
        await validateScheduleOverlap(scheduleData, locationId);

        let createdSchedule: PickupLocationScheduleWithDays;

        // Begin a transaction
        await db.transaction(async tx => {
            // Insert the schedule
            const [schedule] = await tx
                .insert(pickupLocationSchedules)
                .values({
                    pickup_location_id: locationId,
                    name: scheduleData.name,
                    start_date:
                        scheduleData.start_date instanceof Date
                            ? new Date(
                                  scheduleData.start_date.getFullYear(),
                                  scheduleData.start_date.getMonth(),
                                  scheduleData.start_date.getDate(),
                                  12, // Set to noon to avoid any timezone issues
                                  0,
                                  0,
                                  0,
                              )
                                  .toISOString()
                                  .split("T")[0]
                            : scheduleData.start_date,
                    end_date:
                        scheduleData.end_date instanceof Date
                            ? new Date(
                                  scheduleData.end_date.getFullYear(),
                                  scheduleData.end_date.getMonth(),
                                  scheduleData.end_date.getDate(),
                                  12, // Set to noon to avoid any timezone issues
                                  0,
                                  0,
                                  0,
                              )
                                  .toISOString()
                                  .split("T")[0]
                            : scheduleData.end_date,
                })
                .returning();

            // Insert the weekday schedules
            const scheduleDays = await Promise.all(
                scheduleData.days.map(async day => {
                    const [createdDay] = await tx
                        .insert(pickupLocationScheduleDays)
                        .values({
                            schedule_id: schedule.id,
                            weekday: day.weekday,
                            is_open: day.is_open,
                            opening_time: day.opening_time,
                            closing_time: day.closing_time,
                        })
                        .returning();

                    return createdDay;
                }),
            );

            // Create the return object
            createdSchedule = {
                ...schedule,
                days: scheduleDays,
            };
        });

        // Get the current locale from headers
        const locale = (await headers()).get("x-locale") || "en";

        // Revalidate the path to update the UI
        revalidatePath(`/${locale}/handout-locations`, "page");

        return createdSchedule!;
    } catch (error) {
        console.error(`Error creating schedule for location ${locationId}:`, error);
        throw new Error(
            `Failed to create schedule: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// Update an existing schedule
export async function updateSchedule(
    scheduleId: string,
    scheduleData: ScheduleInput,
): Promise<PickupLocationScheduleWithDays> {
    try {
        // Get the current schedule to find the location
        const currentSchedule = await db
            .select({ pickup_location_id: pickupLocationSchedules.pickup_location_id })
            .from(pickupLocationSchedules)
            .where(eq(pickupLocationSchedules.id, scheduleId))
            .limit(1);

        if (currentSchedule.length === 0) {
            throw new Error(`Schedule with ID ${scheduleId} not found`);
        }

        const locationId = currentSchedule[0].pickup_location_id;

        // Validate schedule overlap using shared utility (excluding current schedule)
        const { validateScheduleOverlap } = await import("@/app/utils/schedule/overlap-validation");
        await validateScheduleOverlap(scheduleData, locationId, scheduleId);

        let updatedSchedule: PickupLocationScheduleWithDays;

        // Begin a transaction
        await db.transaction(async tx => {
            // Update the schedule
            const [schedule] = await tx
                .update(pickupLocationSchedules)
                .set({
                    name: scheduleData.name,
                    start_date:
                        scheduleData.start_date instanceof Date
                            ? new Date(
                                  scheduleData.start_date.getFullYear(),
                                  scheduleData.start_date.getMonth(),
                                  scheduleData.start_date.getDate(),
                                  12, // Set to noon to avoid any timezone issues
                                  0,
                                  0,
                                  0,
                              )
                                  .toISOString()
                                  .split("T")[0]
                            : scheduleData.start_date,
                    end_date:
                        scheduleData.end_date instanceof Date
                            ? new Date(
                                  scheduleData.end_date.getFullYear(),
                                  scheduleData.end_date.getMonth(),
                                  scheduleData.end_date.getDate(),
                                  12, // Set to noon to avoid any timezone issues
                                  0,
                                  0,
                                  0,
                              )
                                  .toISOString()
                                  .split("T")[0]
                            : scheduleData.end_date,
                })
                .where(eq(pickupLocationSchedules.id, scheduleId))
                .returning();

            // Delete existing weekday schedules
            await tx
                .delete(pickupLocationScheduleDays)
                .where(eq(pickupLocationScheduleDays.schedule_id, scheduleId));

            // Insert the updated weekday schedules
            const scheduleDays = await Promise.all(
                scheduleData.days.map(async day => {
                    const [createdDay] = await tx
                        .insert(pickupLocationScheduleDays)
                        .values({
                            schedule_id: scheduleId,
                            weekday: day.weekday,
                            is_open: day.is_open,
                            opening_time: day.opening_time,
                            closing_time: day.closing_time,
                        })
                        .returning();

                    return createdDay;
                }),
            );

            // Create the return object
            updatedSchedule = {
                ...schedule,
                days: scheduleDays,
            };
        });

        // Get the current locale from headers
        const locale = (await headers()).get("x-locale") || "en";

        // Revalidate the path to update the UI
        revalidatePath(`/${locale}/handout-locations`, "page");

        return updatedSchedule!;
    } catch (error) {
        console.error(`Error updating schedule with ID ${scheduleId}:`, error);
        throw new Error(
            `Failed to update schedule: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// Delete a schedule
export async function deleteSchedule(scheduleId: string): Promise<void> {
    try {
        // Delete the schedule (cascade will delete related days)
        await db.delete(pickupLocationSchedules).where(eq(pickupLocationSchedules.id, scheduleId));

        // Get the current locale from headers
        const locale = (await headers()).get("x-locale") || "en";

        // Revalidate the path to update the UI
        revalidatePath(`/${locale}/handout-locations`, "page");
    } catch (error) {
        console.error(`Error deleting schedule with ID ${scheduleId}:`, error);
        throw new Error(
            `Failed to delete schedule: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

// PickupLocation interface
export interface PickupLocation {
    id: string;
    name: string;
    street_address: string;
    postal_code: string;
    parcels_max_per_day: number | null;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone_number: string | null;
    default_slot_duration_minutes: number;
}

// Schedule interface
export interface Schedule {
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

// LocationSchedules interface
export interface LocationSchedules {
    schedules: Schedule[];
}

// LocationWithSchedule interface
export interface LocationWithSchedule extends PickupLocation {
    schedules: LocationSchedules;
}
