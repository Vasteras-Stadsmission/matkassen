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
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import {
    LocationFormInput,
    PickupLocationWithAllData,
    ScheduleInput,
    PickupLocationScheduleWithDays,
} from "./types";
import { logError } from "@/app/utils/logger";

// Get all locations with their schedules
export const getLocations = protectedAction(
    async (): Promise<ActionResult<PickupLocationWithAllData[]>> => {
        try {
            // Auth already verified by protectedAction wrapper
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

            return success(locationsWithSchedules);
        } catch (error) {
            logError("Error fetching locations", error, {
                action: "getLocations",
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to fetch locations: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Get a single location with schedules by ID
export const getLocation = protectedAction(
    async (_: unknown, id: string): Promise<ActionResult<PickupLocationWithAllData | null>> => {
        try {
            // Auth already verified by protectedAction wrapper
            // Fetch the location
            const location = await db
                .select()
                .from(pickupLocations)
                .where(eq(pickupLocations.id, id))
                .then(res => res[0] || null);

            if (!location) {
                return success(null);
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
            return success({
                ...location,
                schedules: schedulesWithDays,
            });
        } catch (error) {
            logError("Error fetching location", error, {
                action: "getLocation",
                locationId: id,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to fetch location: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Create a new location
export const createLocation = protectedAction(
    async (
        _: unknown,
        locationData: LocationFormInput,
    ): Promise<ActionResult<PickupLocationWithAllData>> => {
        // Auth already verified by protectedAction wrapper

        try {
            // Process email to ensure it's either null or a valid format
            const contact_email = locationData.contact_email?.trim()
                ? locationData.contact_email.trim()
                : null;

            // Insert the location
            const locationValues = {
                name: locationData.name,
                street_address: locationData.street_address,
                postal_code: locationData.postal_code,
                parcels_max_per_day: locationData.parcels_max_per_day,
                max_parcels_per_slot: locationData.max_parcels_per_slot,
                contact_name: locationData.contact_name,
                contact_email: contact_email, // Use processed email value
                contact_phone_number: locationData.contact_phone_number,
                default_slot_duration_minutes: locationData.default_slot_duration_minutes,
            };
            const [createdLocation] = await db
                .insert(pickupLocations)
                .values(locationValues)
                .returning();

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the path to update the UI
            revalidatePath(`/${locale}/handout-locations`, "page");

            // Return the created location with empty schedules array
            return success({
                ...createdLocation,
                schedules: [],
            });
        } catch (error) {
            logError("Error creating location", error, {
                action: "createLocation",
                locationName: locationData.name,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to create location: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Update an existing location
export const updateLocation = protectedAction(
    async (
        _: unknown,
        id: string,
        locationData: LocationFormInput,
    ): Promise<ActionResult<void>> => {
        // Auth already verified by protectedAction wrapper

        try {
            // Process email to ensure it's either null or a valid format
            const contact_email = locationData.contact_email?.trim()
                ? locationData.contact_email.trim()
                : null;

            // Update the location
            const locationValues = {
                name: locationData.name,
                street_address: locationData.street_address,
                postal_code: locationData.postal_code,
                parcels_max_per_day: locationData.parcels_max_per_day,
                max_parcels_per_slot: locationData.max_parcels_per_slot,
                contact_name: locationData.contact_name,
                contact_email: contact_email, // Use processed email value
                contact_phone_number: locationData.contact_phone_number,
                default_slot_duration_minutes: locationData.default_slot_duration_minutes,
            };
            await db.update(pickupLocations).set(locationValues).where(eq(pickupLocations.id, id));

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the path to update the UI
            revalidatePath(`/${locale}/handout-locations`, "page");
            return success(undefined);
        } catch (error) {
            logError("Error updating location", error, {
                action: "updateLocation",
                locationId: id,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to update location: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Delete a location
export const deleteLocation = protectedAction(
    async (_: unknown, id: string): Promise<ActionResult<void>> => {
        // Auth already verified by protectedAction wrapper

        try {
            // Delete the location (cascade will delete related records)
            await db.delete(pickupLocations).where(eq(pickupLocations.id, id));

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the path to update the UI
            revalidatePath(`/${locale}/handout-locations`, "page");
            return success(undefined);
        } catch (error) {
            logError("Error deleting location", error, {
                action: "deleteLocation",
                locationId: id,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to delete location: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Create a new schedule for a location
export const createSchedule = protectedAction(
    async (
        _: unknown,
        locationId: string,
        scheduleData: ScheduleInput,
    ): Promise<ActionResult<PickupLocationScheduleWithDays>> => {
        // Auth already verified by protectedAction wrapper

        try {
            // Validate schedule overlap using shared utility
            const { validateScheduleOverlap } =
                await import("@/app/utils/schedule/overlap-validation");
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
                        // Persist dates as ISO YYYY-MM-DD derived from UTC to avoid TZ shifts
                        start_date:
                            scheduleData.start_date instanceof Date
                                ? scheduleData.start_date.toISOString().split("T")[0]
                                : scheduleData.start_date,
                        end_date:
                            scheduleData.end_date instanceof Date
                                ? scheduleData.end_date.toISOString().split("T")[0]
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
                                opening_time: day.opening_time || null,
                                closing_time: day.closing_time || null,
                                // NOTE: Drizzle ORM type inference issue - the actual schema includes
                                // all these fields, but auto-generated types don't reflect this correctly.
                                // This is a known limitation with complex enum + nullable field combinations.
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            } as any)
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

            // Recompute outside-hours count for this location after schedule change
            try {
                const { recomputeOutsideHoursCount, clearLocationSchedulesCache } =
                    await import("@/app/[locale]/schedule/actions");
                await recomputeOutsideHoursCount(locationId);
                await clearLocationSchedulesCache(locationId);
            } catch (e) {
                logError("Failed to recompute outside-hours count after schedule create", e, {
                    action: "createSchedule",
                    locationId,
                });
            }

            return success(createdSchedule!);
        } catch (error) {
            logError("Error creating schedule for location", error, {
                action: "createSchedule",
                locationId,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to create schedule: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Update an existing schedule
export const updateSchedule = protectedAction(
    async (
        _: unknown,
        scheduleId: string,
        scheduleData: ScheduleInput,
    ): Promise<ActionResult<PickupLocationScheduleWithDays>> => {
        // Auth already verified by protectedAction wrapper

        try {
            // Get the current schedule to find the location
            const currentSchedule = await db
                .select({ pickup_location_id: pickupLocationSchedules.pickup_location_id })
                .from(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.id, scheduleId))
                .limit(1);

            if (currentSchedule.length === 0) {
                return failure({
                    code: "NOT_FOUND",
                    message: `Schedule with ID ${scheduleId} not found`,
                });
            }

            const locationId = currentSchedule[0].pickup_location_id;

            // Validate schedule overlap using shared utility (excluding current schedule)
            const { validateScheduleOverlap } =
                await import("@/app/utils/schedule/overlap-validation");
            await validateScheduleOverlap(scheduleData, locationId, scheduleId);

            let updatedSchedule: PickupLocationScheduleWithDays;

            // Begin a transaction
            await db.transaction(async tx => {
                // Update the schedule
                const [schedule] = await tx
                    .update(pickupLocationSchedules)
                    .set({
                        name: scheduleData.name,
                        // Persist dates as ISO YYYY-MM-DD derived from UTC to avoid TZ shifts
                        start_date:
                            scheduleData.start_date instanceof Date
                                ? scheduleData.start_date.toISOString().split("T")[0]
                                : scheduleData.start_date,
                        end_date:
                            scheduleData.end_date instanceof Date
                                ? scheduleData.end_date.toISOString().split("T")[0]
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
                                opening_time: day.opening_time || null,
                                closing_time: day.closing_time || null,
                                // NOTE: Drizzle ORM type inference issue - the actual schema includes
                                // all these fields, but auto-generated types don't reflect this correctly.
                                // This is a known limitation with complex enum + nullable field combinations.
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            } as any)
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

            // Recompute outside-hours count for this location after schedule update
            try {
                const { recomputeOutsideHoursCount, clearLocationSchedulesCache } =
                    await import("@/app/[locale]/schedule/actions");
                await recomputeOutsideHoursCount(locationId);
                await clearLocationSchedulesCache(locationId);
            } catch (e) {
                logError("Failed to recompute outside-hours count after schedule update", e, {
                    action: "updateSchedule",
                    scheduleId,
                    locationId,
                });
            }

            return success(updatedSchedule!);
        } catch (error) {
            logError("Error updating schedule", error, {
                action: "updateSchedule",
                scheduleId,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to update schedule: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

// Delete a schedule
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const deleteSchedule = protectedAction(
    async (_session, scheduleId: string): Promise<ActionResult<void>> => {
        // Auth already verified by protectedAction wrapper

        try {
            // Determine location before deletion
            const [scheduleRow] = await db
                .select({ pickup_location_id: pickupLocationSchedules.pickup_location_id })
                .from(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.id, scheduleId))
                .limit(1);

            // Delete the schedule (cascade will delete related days)
            await db
                .delete(pickupLocationSchedules)
                .where(eq(pickupLocationSchedules.id, scheduleId));

            // Get the current locale from headers
            const locale = (await headers()).get("x-locale") || "en";

            // Revalidate the path to update the UI
            revalidatePath(`/${locale}/handout-locations`, "page");

            // Recompute outside-hours count for this location after schedule deletion
            try {
                if (scheduleRow?.pickup_location_id) {
                    const { recomputeOutsideHoursCount, clearLocationSchedulesCache } =
                        await import("@/app/[locale]/schedule/actions");
                    await recomputeOutsideHoursCount(scheduleRow.pickup_location_id);
                    await clearLocationSchedulesCache(scheduleRow.pickup_location_id);
                }
            } catch (e) {
                logError("Failed to recompute outside-hours count after schedule delete", e, {
                    action: "deleteSchedule",
                    scheduleId,
                    locationId: scheduleRow?.pickup_location_id,
                });
            }
            return success(undefined);
        } catch (error) {
            logError("Error deleting schedule", error, {
                action: "deleteSchedule",
                scheduleId,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: `Failed to delete schedule: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    },
);

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
