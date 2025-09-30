"use server";

import { and, eq, gte, lte, sql, between, ne, gt } from "drizzle-orm";
import { db } from "@/app/db/drizzle";
import {
    households,
    foodParcels,
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
} from "@/app/db/schema";
import { isTimeAvailable, isDateAvailable } from "@/app/utils/schedule/location-availability";
import { generateTimeSlotsBetween } from "@/app/utils/date-utils";
import { Time } from "@/app/utils/time-provider";
import { getAvailableTimeRange } from "@/app/utils/schedule/location-availability";
import { isParcelOutsideOpeningHours } from "@/app/utils/schedule/outside-hours-filter";
import { unstable_cache } from "next/cache";
import { revalidatePath, revalidateTag } from "next/cache";
import { verifyServerActionAuth } from "@/app/utils/auth/server-action-auth";

// Import types for use within this server action file
import type {
    FoodParcel,
    PickupLocation,
    LocationSchedule,
    LocationScheduleInfo,
    DayInfo,
    TimeSlotGridData,
} from "./types";

/**
 * Get a specific parcel by ID, regardless of date
 */
export async function getParcelById(parcelId: string): Promise<FoodParcel | null> {
    try {
        const parcelsData = await db
            .select({
                id: foodParcels.id,
                householdId: foodParcels.household_id,
                firstName: households.first_name,
                lastName: households.last_name,
                pickupEarliestTime: foodParcels.pickup_date_time_earliest,
                pickupLatestTime: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
                pickupLocationId: foodParcels.pickup_location_id,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .where(eq(foodParcels.id, parcelId))
            .limit(1);

        if (parcelsData.length === 0) {
            return null;
        }

        const parcel = parcelsData[0];

        // Create Stockholm timezone date for the pickup date
        const pickupTimeStockholm = Time.fromDate(new Date(parcel.pickupEarliestTime));
        const pickupDate = pickupTimeStockholm.startOfDay().toDate();

        return {
            id: parcel.id,
            householdId: parcel.householdId,
            householdName: `${parcel.firstName} ${parcel.lastName}`,
            pickupDate,
            pickupEarliestTime: new Date(parcel.pickupEarliestTime),
            pickupLatestTime: new Date(parcel.pickupLatestTime),
            isPickedUp: parcel.isPickedUp,
            pickup_location_id: parcel.pickupLocationId,
        };
    } catch (error) {
        console.error("Error fetching parcel by ID:", error);
        return null;
    }
}
export async function getPickupLocations(): Promise<PickupLocation[]> {
    try {
        const locations = await db
            .select({
                id: pickupLocations.id,
                name: pickupLocations.name,
                street_address: pickupLocations.street_address,
                maxParcelsPerDay: pickupLocations.parcels_max_per_day,
                outsideHoursCount: pickupLocations.outside_hours_count,
            })
            .from(pickupLocations);

        return locations;
    } catch (error) {
        console.error("Error fetching pickup locations:", error);
        return [];
    }
}

/**
 * Get all parcels scheduled for today across all locations
 */
export async function getTodaysParcels(): Promise<FoodParcel[]> {
    try {
        // Get today's date range in Stockholm timezone
        const today = new Date();
        const todayInStockholm = Time.fromDate(today);
        const startTimeStockholm = todayInStockholm.startOfDay();
        const endTimeStockholm = todayInStockholm.endOfDay();

        // Convert to UTC for database query
        const startDate = startTimeStockholm.toDate();
        const endDate = endTimeStockholm.toDate();

        // Query food parcels for today across all locations
        const parcelsData = await db
            .select({
                id: foodParcels.id,
                householdId: foodParcels.household_id,
                firstName: households.first_name,
                lastName: households.last_name,
                pickupEarliestTime: foodParcels.pickup_date_time_earliest,
                pickupLatestTime: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
                pickupLocationId: foodParcels.pickup_location_id,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .where(
                and(
                    gte(foodParcels.pickup_date_time_earliest, startDate),
                    lte(foodParcels.pickup_date_time_earliest, endDate),
                ),
            )
            .orderBy(foodParcels.pickup_date_time_earliest);

        // Transform the data to the expected format with proper timezone handling
        return parcelsData.map(parcel => {
            // Create Stockholm timezone date for the pickup date
            const pickupTimeStockholm = Time.fromDate(new Date(parcel.pickupEarliestTime));
            const pickupDate = pickupTimeStockholm.startOfDay().toDate();

            return {
                id: parcel.id,
                householdId: parcel.householdId,
                householdName: `${parcel.firstName} ${parcel.lastName}`,
                pickupDate,
                pickupEarliestTime: new Date(parcel.pickupEarliestTime),
                pickupLatestTime: new Date(parcel.pickupLatestTime),
                isPickedUp: parcel.isPickedUp,
                pickup_location_id: parcel.pickupLocationId,
            };
        });
    } catch (error) {
        console.error("Error fetching today's parcels:", error);
        return [];
    }
}

/**
 * Get all food parcels for a specific location and week
 */
export async function getFoodParcelsForWeek(
    locationId: string,
    weekStart: Date,
    weekEnd: Date,
): Promise<FoodParcel[]> {
    try {
        // Get start and end of the week in UTC for database query
        // Normalize the requested range to full Stockholm-local days (Mon 00:00 -> Sun 23:59:59.999)
        // This avoids off-by-one-day issues when callers pass dates at midnight
        const startTimeStockholm = Time.fromDate(weekStart).startOfDay();
        const endTimeStockholm = Time.fromDate(weekEnd).endOfDay();

        // Convert back to UTC for database query
        const startDate = startTimeStockholm.toDate();
        const endDate = endTimeStockholm.toDate();

        // Query food parcels for this location and week
        const parcelsData = await db
            .select({
                id: foodParcels.id,
                householdId: foodParcels.household_id,
                firstName: households.first_name,
                lastName: households.last_name,
                pickupEarliestTime: foodParcels.pickup_date_time_earliest,
                pickupLatestTime: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .where(
                and(
                    eq(foodParcels.pickup_location_id, locationId),
                    between(foodParcels.pickup_date_time_earliest, startDate, endDate),
                ),
            )
            .orderBy(foodParcels.pickup_date_time_earliest);

        // Transform the data to the expected format with proper timezone handling
        return parcelsData.map(parcel => {
            // Create Stockholm timezone date for the pickup date
            const pickupTimeStockholm = Time.fromDate(new Date(parcel.pickupEarliestTime));
            const pickupDate = pickupTimeStockholm.startOfDay().toDate();

            return {
                id: parcel.id,
                householdId: parcel.householdId,
                householdName: `${parcel.firstName} ${parcel.lastName}`,
                pickupDate,
                pickupEarliestTime: new Date(parcel.pickupEarliestTime),
                pickupLatestTime: new Date(parcel.pickupLatestTime),
                isPickedUp: parcel.isPickedUp,
            };
        });
    } catch (error) {
        console.error("Error fetching food parcels for week:", error);
        return [];
    }
}

/**
 * Get the number of food parcels for each timeslot on a specific date
 */
export async function getTimeslotCounts(
    locationId: string,
    date: Date,
): Promise<Record<string, number>> {
    try {
        // Get start and end of the date in Stockholm timezone, then convert to UTC for DB query
        const dateInStockholm = Time.fromDate(date);
        const startTimeStockholm = dateInStockholm.startOfDay();
        const endTimeStockholm = dateInStockholm.endOfDay();

        // Convert to UTC for database query
        const startDate = startTimeStockholm.toDate();
        const endDate = endTimeStockholm.toDate();

        // Fetch the location settings to get the slot duration
        const [locationSettings] = await db
            .select({
                slotDuration: pickupLocations.default_slot_duration_minutes,
            })
            .from(pickupLocations)
            .where(eq(pickupLocations.id, locationId))
            .limit(1);

        // Default to 30 minutes if setting is not found
        const slotDurationMinutes = locationSettings?.slotDuration;

        // Query food parcels for this location and date
        const parcels = await db
            .select({
                pickupEarliestTime: foodParcels.pickup_date_time_earliest,
            })
            .from(foodParcels)
            .where(
                and(
                    eq(foodParcels.pickup_location_id, locationId),
                    between(foodParcels.pickup_date_time_earliest, startDate, endDate),
                ),
            );

        // Count parcels by time slot using the location's slot duration
        const timeslotCounts: Record<string, number> = {};

        parcels.forEach(parcel => {
            const time = Time.fromDate(new Date(parcel.pickupEarliestTime));
            const hour = parseInt(time.format("HH"), 10);

            // Round to the nearest slot based on the location's slot duration
            const totalMinutes = parseInt(time.format("mm"), 10);
            const slotIndex = Math.floor(totalMinutes / slotDurationMinutes);
            const minutes = slotIndex * slotDurationMinutes;

            const key = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

            if (!timeslotCounts[key]) {
                timeslotCounts[key] = 0;
            }

            timeslotCounts[key] += 1;
        });

        return timeslotCounts;
    } catch (error) {
        console.error("Error fetching timeslot counts:", error);
        return {};
    }
}

/**
 * Update a food parcel's schedule (used when dragging to a new timeslot)
 */
export async function updateFoodParcelSchedule(
    parcelId: string,
    newTimeslot: {
        date: Date;
        startTime: Date;
        endTime: Date;
    },
): Promise<{
    success: boolean;
    error?: string;
    errors?: Array<{
        field: string;
        code: string;
        message: string;
        details?: Record<string, unknown>;
    }>;
}> {
    try {
        // Authorization: Verify user is authenticated and is an org member
        const authResult = await verifyServerActionAuth();
        if (!authResult.authorized) {
            return {
                success: false,
                error: authResult.error?.message || "Unauthorized",
                errors: [
                    {
                        field: authResult.error?.field || "auth",
                        code: authResult.error?.code || "UNAUTHORIZED",
                        message:
                            authResult.error?.message ||
                            "You must be authenticated to perform this action",
                    },
                ],
            };
        }

        // Log the action for audit trail
        console.log(
            `[AUDIT] User ${authResult.session?.user?.name} rescheduling parcel ${parcelId}`,
        );

        // We'll use a transaction to make the capacity check and update atomic
        // This prevents race conditions where two parallel operations could both pass the capacity check
        return await db.transaction(async tx => {
            // Get parcel information first
            const [parcel] = await tx
                .select({
                    locationId: foodParcels.pickup_location_id,
                })
                .from(foodParcels)
                .where(eq(foodParcels.id, parcelId))
                .limit(1);

            if (!parcel) {
                return {
                    success: false,
                    error: "Food parcel not found",
                    errors: [
                        {
                            field: "parcelId",
                            code: "PARCEL_NOT_FOUND",
                            message: "Food parcel not found",
                        },
                    ],
                };
            }

            // Get the location's slot duration to calculate proper end time
            const [location] = await tx
                .select({
                    slotDuration: pickupLocations.default_slot_duration_minutes,
                })
                .from(pickupLocations)
                .where(eq(pickupLocations.id, parcel.locationId))
                .limit(1);

            // Calculate the correct end time based on the location's slot duration
            const slotDurationMinutes = location?.slotDuration || 15;
            const endTime = new Date(newTimeslot.startTime);
            endTime.setMinutes(endTime.getMinutes() + slotDurationMinutes);

            // Use comprehensive validation
            const { validateParcelAssignment } = await import(
                "@/app/utils/validation/parcel-assignment"
            );
            const validationResult = await validateParcelAssignment({
                parcelId,
                newLocationId: parcel.locationId,
                newTimeslot: {
                    startTime: newTimeslot.startTime,
                    endTime, // Use calculated end time
                },
                newDate: newTimeslot.startTime.toISOString().split("T")[0],
                tx,
            });

            if (!validationResult.success) {
                // Return the first error for backward compatibility, but include all errors
                const errors = validationResult.errors || [];
                const primaryError = errors[0];
                const { formatValidationError } = await import(
                    "@/app/utils/validation/parcel-assignment"
                );

                return {
                    success: false,
                    error: formatValidationError(primaryError),
                    errors,
                };
            }

            // Update the food parcel's schedule using the calculated endTime
            await tx
                .update(foodParcels)
                .set({
                    pickup_date_time_earliest: newTimeslot.startTime,
                    pickup_date_time_latest: endTime, // Use our calculated end time
                })
                .where(eq(foodParcels.id, parcelId));

            // Recompute persisted outside-hours count for this location
            try {
                await recomputeOutsideHoursCount(parcel.locationId);
            } catch (e) {
                console.error("Failed to recompute outside-hours count:", e);
            }

            return { success: true };
        });
    } catch (error) {
        console.error("Error updating food parcel schedule:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
            errors: [
                {
                    field: "general",
                    code: "INTERNAL_ERROR",
                    message: error instanceof Error ? error.message : "Unknown error occurred",
                },
            ],
        };
    }
}

/**
 * Validate parcel assignments for forms (without actually updating)
 */
export async function validateParcelAssignments(
    parcels: Array<{
        id?: string; // Optional for new parcels
        householdId: string;
        locationId: string;
        pickupDate: Date;
        pickupStartTime: Date;
        pickupEndTime: Date;
    }>,
): Promise<{
    success: boolean;
    errors: Array<{
        field: string;
        code: string;
        message: string;
        details?: Record<string, unknown>;
    }>;
}> {
    try {
        if (parcels.length === 0) {
            return { success: true, errors: [] };
        }

        // Get location schedules for the first location (assuming all parcels are for the same location)
        const locationId = parcels[0].locationId;

        // Import validation utilities
        const { validateBulkParcelAssignments } = await import(
            "@/app/utils/validation/parcel-assignment"
        );

        // Prepare assignments for validation
        const assignments = parcels.map(parcel => ({
            parcelId: parcel.id || `temp_${Math.random()}`, // Generate temp ID for new parcels
            timeslot: {
                date: parcel.pickupDate.toISOString().split("T")[0],
                startTime: parcel.pickupStartTime,
                endTime: parcel.pickupEndTime,
            },
        }));

        // Use bulk validation for form submissions
        const validationResult = await validateBulkParcelAssignments(assignments, locationId);

        return {
            success: validationResult.success,
            errors: validationResult.errors || [],
        };
    } catch (error) {
        console.error("Error validating parcel assignments:", error);
        return {
            success: false,
            errors: [
                {
                    field: "general",
                    code: "VALIDATION_ERROR",
                    message: "An error occurred during validation",
                },
            ],
        };
    }
}

/**
 * Get all schedules for a pickup location
 */
export const getPickupLocationSchedules = async (
    locationId: string,
): Promise<LocationScheduleInfo> => {
    // Create a cached function that will fetch the schedules
    const cachedFetchSchedules = unstable_cache(
        async (): Promise<LocationScheduleInfo> => {
            try {
                // Use localized date to align with Stockholm schedule boundaries
                const currentDateStr = Time.now().toDateString();

                // Get all current and upcoming schedules for this location
                // (end_date is in the future - this includes both active and upcoming schedules)
                const schedules = await db
                    .select({
                        id: pickupLocationSchedules.id,
                        name: pickupLocationSchedules.name,
                        startDate: pickupLocationSchedules.start_date,
                        endDate: pickupLocationSchedules.end_date,
                    })
                    .from(pickupLocationSchedules)
                    .where(
                        and(
                            eq(pickupLocationSchedules.pickup_location_id, locationId),
                            sql`${pickupLocationSchedules.end_date} >= ${currentDateStr}::date`,
                        ),
                    );

                // For each schedule, get the days it's active
                const schedulesWithDays = await Promise.all(
                    schedules.map(async schedule => {
                        const days = await db
                            .select({
                                weekday: pickupLocationScheduleDays.weekday,
                                isOpen: pickupLocationScheduleDays.is_open,
                                openingTime: pickupLocationScheduleDays.opening_time,
                                closingTime: pickupLocationScheduleDays.closing_time,
                            })
                            .from(pickupLocationScheduleDays)
                            .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

                        return {
                            ...schedule,
                            days,
                        };
                    }),
                );

                return {
                    schedules: schedulesWithDays,
                };
            } catch (error) {
                console.error("Error fetching pickup location schedules:", error);
                return {
                    schedules: [],
                };
            }
        },
        // Use a key that includes the location ID for better caching
        [`pickup-location-schedules-${locationId}`],
        {
            // Cache results for 1 minute (60 seconds) to reduce staleness
            revalidate: 60,
            // Add tags for more precise cache invalidation
            tags: [`location-schedules`, `location-schedules-${locationId}`],
        },
    );

    // IMPORTANT: We need to invoke the cached function, not just return it
    return cachedFetchSchedules();
};

/**
 * Clear the cache for a specific location's schedules
 * Call this when schedules are updated to ensure fresh data
 */
export const clearLocationSchedulesCache = async (locationId: string) => {
    try {
        // Use revalidateTag for more precise cache invalidation
        revalidateTag(`location-schedules-${locationId}`);
        revalidateTag(`location-schedules`);

        // Also revalidate the relevant pages
        revalidatePath(`/schedule`);
        revalidatePath(`/handout-locations`);
    } catch (error) {
        console.error(`Error clearing cache for location ${locationId}:`, error);
    }
};

/**
 * Check if a pickup location is open on a specific date and time
 */
export async function checkLocationAvailability(
    locationId: string,
    date: Date,
    time: string,
): Promise<{ isAvailable: boolean; reason?: string }> {
    try {
        const scheduleInfo = await getPickupLocationSchedules(locationId);

        // Rebase the input date into Stockholm time to align with stored schedules
        const requestDate = Time.fromDate(date);
        const weekday = requestDate.getWeekdayName();
        const requestDayStart = requestDate.startOfDay();

        // Check regular schedules
        for (const schedule of scheduleInfo.schedules) {
            const scheduleStart = Time.fromDate(new Date(schedule.startDate)).startOfDay();
            const scheduleEnd = Time.fromDate(new Date(schedule.endDate)).endOfDay();

            // Check if date is within schedule's range
            if (requestDayStart.isBetween(scheduleStart, scheduleEnd)) {
                const dayConfig = schedule.days.find(day => day.weekday === weekday);

                // If the day is closed in this schedule, continue to the next schedule
                if (
                    !dayConfig ||
                    !dayConfig.isOpen ||
                    !dayConfig.openingTime ||
                    !dayConfig.closingTime
                ) {
                    continue;
                }

                // Check if the requested time is within opening hours
                const [hours, minutes] = time.split(":").map(Number);
                const timeValue = hours * 60 + minutes;

                const [openHours, openMinutes] = dayConfig.openingTime.split(":").map(Number);
                const openValue = openHours * 60 + openMinutes;

                const [closeHours, closeMinutes] = dayConfig.closingTime.split(":").map(Number);
                const closeValue = closeHours * 60 + closeMinutes;

                // Allow times that end exactly at closing time
                if (timeValue < openValue || timeValue > closeValue) {
                    return {
                        isAvailable: false,
                        reason: `This location is only open from ${dayConfig.openingTime} to ${dayConfig.closingTime} on ${weekday}s`,
                    };
                }

                return { isAvailable: true };
            }
        }

        // If no schedule is found for this date, it's unavailable
        return {
            isAvailable: false,
            reason: "This location has no scheduled opening hours for this date",
        };
    } catch (error) {
        console.error("Error checking location availability:", error);
        // Default to available in case of error to prevent blocking users
        return { isAvailable: true };
    }
}

// Add a function to get available time slots for a specific date and location
export async function getAvailableTimeSlots(
    locationId: string,
    date: Date,
): Promise<{ available: boolean; openingTime: string | null; closingTime: string | null }> {
    try {
        const dateStr = Time.fromDate(date).format("yyyy-MM-dd");
        const stockhlmTime = Time.fromDate(date);
        const weekdayName = stockhlmTime.getWeekdayName();

        // Get schedules for this location that include this date
        const schedules = await db
            .select()
            .from(pickupLocationSchedules)
            .where(
                and(
                    eq(pickupLocationSchedules.pickup_location_id, locationId),
                    lte(pickupLocationSchedules.start_date, dateStr),
                    gte(pickupLocationSchedules.end_date, dateStr),
                ),
            );

        if (schedules.length === 0) {
            return { available: false, openingTime: null, closingTime: null };
        }

        // Find the first schedule that has this day configured as open
        for (const schedule of schedules) {
            const day = await db
                .select()
                .from(pickupLocationScheduleDays)
                .where(
                    and(
                        eq(pickupLocationScheduleDays.schedule_id, schedule.id),
                        eq(pickupLocationScheduleDays.weekday, weekdayName),
                    ),
                )
                .then(res => res[0] || null);

            if (day && day.is_open) {
                return {
                    available: true,
                    openingTime: day.opening_time,
                    closingTime: day.closing_time,
                };
            }
        }

        return { available: false, openingTime: null, closingTime: null };
    } catch (error) {
        console.error("Error getting available time slots:", error);
        return { available: false, openingTime: null, closingTime: null };
    }
}

// Add the getTimeSlotGrid function
export async function getTimeSlotGrid(locationId: string, week: Date[]): Promise<TimeSlotGridData> {
    try {
        // Fetch the location with its schedules and settings
        const locationData = await getLocationWithSchedules(locationId);

        // Also fetch the location settings to get the slot duration
        const [locationSettings] = await db
            .select({
                slotDuration: pickupLocations.default_slot_duration_minutes,
            })
            .from(pickupLocations)
            .where(eq(pickupLocations.id, locationId))
            .limit(1);

        const slotDurationMinutes = locationSettings?.slotDuration;

        if (!locationData) {
            throw new Error("Location not found");
        }

        // Generate day info for each day in the week
        const days: DayInfo[] = week.map(date => {
            const availability = isDateAvailable(date, locationData);

            return {
                date,
                isAvailable: availability.isAvailable,
                unavailableReason: availability.isAvailable ? undefined : availability.reason,
            };
        });

        // Generate timeslots based on the location's schedule
        // Get the first available day to determine time slots
        const availableDay = days.find(day => day.isAvailable);
        let timeslots: string[] = [];

        if (availableDay) {
            const timeRange = getAvailableTimeRange(availableDay.date, locationData);

            if (timeRange.earliestTime && timeRange.latestTime) {
                timeslots = generateTimeSlotsBetween(
                    timeRange.earliestTime,
                    timeRange.latestTime,
                    slotDurationMinutes ?? 15,
                    true,
                );
            }
        }

        // If no timeslots were generated, use default ones with the location's slot duration
        if (timeslots.length === 0) {
            timeslots = generateTimeSlotsBetween(
                "09:00",
                "17:00",
                slotDurationMinutes ?? 15,
                false,
            );
        }

        return {
            days,
            timeslots,
        };
    } catch (error) {
        console.error("Error generating time slot grid:", error);
        throw error;
    }
}

/**
 * Get a location with its schedules
 */
export async function getLocationWithSchedules(locationId: string): Promise<LocationScheduleInfo> {
    // This is essentially a wrapper around getPickupLocationSchedules to make the code more explicit
    return getPickupLocationSchedules(locationId);
}

/**
 * Get the default slot duration for a pickup location
 */
export async function getLocationSlotDuration(locationId: string): Promise<number> {
    try {
        // Fetch location settings to get the slot duration
        const [locationSettings] = await db
            .select({
                slotDuration: pickupLocations.default_slot_duration_minutes,
            })
            .from(pickupLocations)
            .where(eq(pickupLocations.id, locationId))
            .limit(1);

        // Default to 15 minutes if setting is not found
        return locationSettings?.slotDuration ?? 15;
    } catch (error) {
        console.error("Error fetching location slot duration:", error);
        // Default to 15 minutes in case of error
        return 15;
    }
}

/**
 * Check how many future parcels would be affected by a schedule change
 * Returns the count of parcels that would fall outside opening hours if the proposed schedule is applied
 */
export async function checkParcelsAffectedByScheduleChange(
    locationId: string,
    proposedSchedule: {
        start_date: Date;
        end_date: Date;
        days: Array<{
            weekday: string;
            is_open: boolean;
            opening_time?: string;
            closing_time?: string;
        }>;
    },
    excludeScheduleId?: string, // For edits, exclude the current schedule from validation
): Promise<number> {
    // Use TimeProvider for consistent timezone handling
    const now = Time.now();

    // Get all future, active parcels for this location
    const parcels = await db
        .select({
            id: foodParcels.id,
            earliest: foodParcels.pickup_date_time_earliest,
            latest: foodParcels.pickup_date_time_latest,
        })
        .from(foodParcels)
        .where(
            and(
                eq(foodParcels.pickup_location_id, locationId),
                eq(foodParcels.is_picked_up, false),
                gt(foodParcels.pickup_date_time_earliest, now.toUTC()),
            ),
        );

    if (parcels.length === 0) return 0;

    // Get current schedules for this location (excluding the one being edited if applicable)
    const currentSchedules = await db
        .select({
            id: pickupLocationSchedules.id,
            start_date: pickupLocationSchedules.start_date,
            end_date: pickupLocationSchedules.end_date,
        })
        .from(pickupLocationSchedules)
        .where(
            and(
                eq(pickupLocationSchedules.pickup_location_id, locationId),
                excludeScheduleId ? ne(pickupLocationSchedules.id, excludeScheduleId) : undefined,
                sql`${pickupLocationSchedules.end_date} >= ${now.toDateString()}::date`,
            ),
        );

    // Get the days for current schedules
    const currentSchedulesWithDays = await Promise.all(
        currentSchedules.map(async schedule => {
            const days = await db
                .select({
                    weekday: pickupLocationScheduleDays.weekday,
                    is_open: pickupLocationScheduleDays.is_open,
                    opening_time: pickupLocationScheduleDays.opening_time,
                    closing_time: pickupLocationScheduleDays.closing_time,
                })
                .from(pickupLocationScheduleDays)
                .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

            return {
                id: schedule.id,
                name: `schedule-${schedule.id}`,
                startDate: schedule.start_date,
                endDate: schedule.end_date,
                days: days.map(day => ({
                    weekday: day.weekday,
                    isOpen: day.is_open,
                    openingTime: day.opening_time || "09:00",
                    closingTime: day.closing_time || "17:00",
                })),
            };
        }),
    );

    // Build the proposed schedule structure
    const proposedScheduleForCheck: LocationSchedule = {
        id: excludeScheduleId ? `edited-${excludeScheduleId}` : "temp-new-schedule",
        name: excludeScheduleId ? `edited-${excludeScheduleId}` : "temp-new-schedule",
        startDate: proposedSchedule.start_date,
        endDate: proposedSchedule.end_date,
        days: proposedSchedule.days.map(day => ({
            weekday: day.weekday,
            isOpen: day.is_open,
            openingTime: day.opening_time || "09:00",
            closingTime: day.closing_time || "17:00",
        })),
    };

    // Build schedule info objects for availability checking
    let currentScheduleInfo: { schedules: LocationSchedule[] };
    let futureScheduleInfo: { schedules: LocationSchedule[] };

    if (excludeScheduleId) {
        // When editing an existing schedule, we need to:
        // 1. Compare current state (all schedules including the one being edited)
        // 2. With future state (all schedules except the original, plus the proposed changes)

        // Get the original schedule being edited to include in current state
        const originalScheduleResult = await db
            .select({
                id: pickupLocationSchedules.id,
                start_date: pickupLocationSchedules.start_date,
                end_date: pickupLocationSchedules.end_date,
            })
            .from(pickupLocationSchedules)
            .where(eq(pickupLocationSchedules.id, excludeScheduleId));

        if (originalScheduleResult.length > 0) {
            const originalSchedule = originalScheduleResult[0];
            const originalDays = await db
                .select({
                    weekday: pickupLocationScheduleDays.weekday,
                    is_open: pickupLocationScheduleDays.is_open,
                    opening_time: pickupLocationScheduleDays.opening_time,
                    closing_time: pickupLocationScheduleDays.closing_time,
                })
                .from(pickupLocationScheduleDays)
                .where(eq(pickupLocationScheduleDays.schedule_id, originalSchedule.id));

            const originalScheduleForCheck: LocationSchedule = {
                id: originalSchedule.id,
                name: `original-schedule-${originalSchedule.id}`,
                startDate: originalSchedule.start_date,
                endDate: originalSchedule.end_date,
                days: originalDays.map(day => ({
                    weekday: day.weekday,
                    isOpen: day.is_open,
                    openingTime: day.opening_time || "09:00",
                    closingTime: day.closing_time || "17:00",
                })),
            };

            // Current state: all schedules including the original
            currentScheduleInfo = {
                schedules: [...currentSchedulesWithDays, originalScheduleForCheck],
            };
        } else {
            // Fallback if original schedule not found
            currentScheduleInfo = { schedules: currentSchedulesWithDays };
        }

        // Future state: all other schedules plus the proposed changes
        futureScheduleInfo = {
            schedules: [...currentSchedulesWithDays, proposedScheduleForCheck],
        };
    } else {
        // When creating a new schedule:
        // Current state: existing schedules only
        currentScheduleInfo = { schedules: currentSchedulesWithDays };
        // Future state: existing schedules plus the new one
        futureScheduleInfo = {
            schedules: [...currentSchedulesWithDays, proposedScheduleForCheck],
        };
    }

    let affectedCount = 0;

    for (const parcel of parcels) {
        const startLocal = Time.fromDate(new Date(parcel.earliest));
        const endLocal = Time.fromDate(new Date(parcel.latest));
        const startTime = startLocal.toTimeString();
        const endTime = endLocal.toTimeString();

        // Check current availability (before the change)
        const currentStartAvailability = isTimeAvailable(
            startLocal.toDate(),
            startTime,
            currentScheduleInfo,
        );
        const currentEndAvailability = isTimeAvailable(
            endLocal.toDate(),
            endTime,
            currentScheduleInfo,
        );
        const isCurrentlyAvailable =
            currentStartAvailability.isAvailable && currentEndAvailability.isAvailable;

        // Check future availability (after the change)
        const futureStartAvailability = isTimeAvailable(
            startLocal.toDate(),
            startTime,
            futureScheduleInfo,
        );
        const futureEndAvailability = isTimeAvailable(
            endLocal.toDate(),
            endTime,
            futureScheduleInfo,
        );
        const willBeAvailable =
            futureStartAvailability.isAvailable && futureEndAvailability.isAvailable;

        // A parcel is negatively affected if it's currently available but would become unavailable
        // For new schedules, this means parcels that become worse off (move from inside hours to outside hours)
        // For edits, this captures the net negative impact
        if (isCurrentlyAvailable && !willBeAvailable) {
            affectedCount++;
        }
    }

    return affectedCount;
}

/**
 * Check how many future parcels would be affected by schedule deletion
 * Returns the count of parcels that would fall outside opening hours if the schedule is deleted
 */
export async function checkParcelsAffectedByScheduleDeletion(
    locationId: string,
    scheduleToDelete: {
        id: string;
        start_date: Date;
        end_date: Date;
        days: Array<{
            weekday: string;
            is_open: boolean;
            opening_time?: string;
            closing_time?: string;
        }>;
    },
): Promise<number> {
    // Use TimeProvider for consistent timezone handling
    const now = Time.now();

    // Get all future, active parcels for this location
    const parcels = await db
        .select({
            id: foodParcels.id,
            earliest: foodParcels.pickup_date_time_earliest,
            latest: foodParcels.pickup_date_time_latest,
        })
        .from(foodParcels)
        .where(
            and(
                eq(foodParcels.pickup_location_id, locationId),
                eq(foodParcels.is_picked_up, false),
                gt(foodParcels.pickup_date_time_earliest, now.toUTC()),
            ),
        );

    if (parcels.length === 0) return 0;

    // Get all other schedules for this location (excluding the one to be deleted)
    const otherSchedules = await db
        .select({
            id: pickupLocationSchedules.id,
            start_date: pickupLocationSchedules.start_date,
            end_date: pickupLocationSchedules.end_date,
        })
        .from(pickupLocationSchedules)
        .where(
            and(
                eq(pickupLocationSchedules.pickup_location_id, locationId),
                ne(pickupLocationSchedules.id, scheduleToDelete.id),
                sql`${pickupLocationSchedules.end_date} >= ${now.toDateString()}::date`,
            ),
        );

    // Get the days for other schedules
    const otherSchedulesWithDays = await Promise.all(
        otherSchedules.map(async schedule => {
            const days = await db
                .select({
                    weekday: pickupLocationScheduleDays.weekday,
                    is_open: pickupLocationScheduleDays.is_open,
                    opening_time: pickupLocationScheduleDays.opening_time,
                    closing_time: pickupLocationScheduleDays.closing_time,
                })
                .from(pickupLocationScheduleDays)
                .where(eq(pickupLocationScheduleDays.schedule_id, schedule.id));

            return {
                ...schedule,
                days,
            };
        }),
    );

    let affectedCount = 0;

    for (const parcel of parcels) {
        const startLocal = Time.fromDate(new Date(parcel.earliest));
        const endLocal = Time.fromDate(new Date(parcel.latest));

        // Check if the parcel falls within the date range of the schedule being deleted
        // Use start of day for schedule start and end of day for schedule end to properly compare date ranges
        const scheduleStart = Time.fromDate(scheduleToDelete.start_date).startOfDay();
        const scheduleEnd = Time.fromDate(scheduleToDelete.end_date).endOfDay();

        if (startLocal.isBetween(scheduleStart, scheduleEnd)) {
            // Check if this parcel would be outside opening hours after deletion
            const startTime = startLocal.toTimeString();
            const endTime = endLocal.toTimeString();

            // Check if the parcel would be available with the remaining schedules
            let isAvailable = false;

            for (const schedule of otherSchedulesWithDays) {
                const scheduleStartTime = Time.fromDate(new Date(schedule.start_date)).startOfDay();
                const scheduleEndTime = Time.fromDate(new Date(schedule.end_date)).endOfDay();

                // Check if the parcel date falls within this schedule's range
                if (startLocal.isBetween(scheduleStartTime, scheduleEndTime)) {
                    // Use our consistent weekday mapping
                    const weekday = startLocal.getWeekdayName();

                    const scheduleDay = schedule.days.find(day => day.weekday === weekday);

                    if (scheduleDay && scheduleDay.is_open) {
                        // Check if the parcel time is within this schedule's opening hours
                        const openingTime = scheduleDay.opening_time || "09:00";
                        const closingTime = scheduleDay.closing_time || "17:00";

                        if (startTime >= openingTime && endTime <= closingTime) {
                            isAvailable = true;
                            break;
                        }
                    }
                }
            }

            // If the parcel is not available with any remaining schedule, it's affected
            if (!isAvailable) {
                affectedCount++;
            }
        }
    }

    return affectedCount;
}

/**
 * Core function to identify outside-hours parcels for a location
 * This function contains the shared logic used by both getOutsideHoursParcelsForLocation and recomputeOutsideHoursCount
 */
async function identifyOutsideHoursParcels(locationId: string): Promise<{
    outsideParcels: FoodParcel[];
    totalCount: number;
}> {
    // Use TimeProvider for consistent timezone handling
    const now = Time.now();

    // Get all future, active parcels for this location
    let parcels;
    try {
        parcels = await db
            .select({
                id: foodParcels.id,
                householdId: foodParcels.household_id,
                householdName: sql<string>`${households.first_name} || ' ' || ${households.last_name}`,
                pickupDate: foodParcels.pickup_date_time_earliest,
                pickupEarliestTime: foodParcels.pickup_date_time_earliest,
                pickupLatestTime: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .where(
                and(
                    eq(foodParcels.pickup_location_id, locationId),
                    eq(foodParcels.is_picked_up, false),
                    gt(foodParcels.pickup_date_time_earliest, now.toUTC()),
                ),
            );
    } catch (error) {
        console.error(`Error getting outside hours parcels for location:`, error);
        return { outsideParcels: [], totalCount: 0 };
    }

    if (parcels.length === 0) {
        return { outsideParcels: [], totalCount: 0 };
    }

    // Get current schedules for this location
    const locationSchedules = await getPickupLocationSchedules(locationId);

    if (!locationSchedules || !locationSchedules.schedules) {
        // Transform to FoodParcel format
        const outsideParcels = parcels.map(parcel => ({
            ...parcel,
            pickupDate: new Date(parcel.pickupDate),
        }));
        return { outsideParcels, totalCount: parcels.length };
    }

    // Filter to only parcels that are outside opening hours
    const outsideParcels: FoodParcel[] = [];

    for (const parcel of parcels) {
        // Convert to the format expected by the centralized function
        const parcelTimeInfo = {
            id: parcel.id,
            pickupEarliestTime: new Date(parcel.pickupEarliestTime),
            pickupLatestTime: new Date(parcel.pickupLatestTime),
            isPickedUp: parcel.isPickedUp,
        };

        // Use the centralized logic to determine if parcel is outside opening hours
        if (isParcelOutsideOpeningHours(parcelTimeInfo, locationSchedules)) {
            outsideParcels.push({
                ...parcel,
                pickupDate: new Date(parcel.pickupDate),
            });
        }
    }

    return { outsideParcels, totalCount: outsideParcels.length };
}

/**
 * Get all future outside-hours parcels for a specific location
 */
export async function getOutsideHoursParcelsForLocation(locationId: string): Promise<FoodParcel[]> {
    try {
        const { outsideParcels } = await identifyOutsideHoursParcels(locationId);
        return outsideParcels;
    } catch (error) {
        console.error("Error getting outside hours parcels for location:", error);
        return [];
    }
}

/**
 * Get the total count of outside hours parcels across all locations
 */
export async function getTotalOutsideHoursCount(): Promise<number> {
    try {
        const result = await db
            .select({ totalCount: sql<number>`sum(${pickupLocations.outside_hours_count})` })
            .from(pickupLocations);

        return result[0]?.totalCount || 0;
    } catch (error) {
        console.error("Error getting total outside hours count:", error);
        return 0;
    }
}

/**
 * Recompute and persist the count of future parcels outside opening hours for a location
 */
export async function recomputeOutsideHoursCount(locationId: string): Promise<number> {
    try {
        // Use the shared logic to get the count
        const result = await identifyOutsideHoursParcels(locationId);
        const { totalCount } = result;

        // Update the persisted count
        await db
            .update(pickupLocations)
            .set({ outside_hours_count: totalCount })
            .where(eq(pickupLocations.id, locationId));

        return totalCount;
    } catch (error) {
        console.error("Error recomputing outside hours count:", error);
        return 0;
    }
}
