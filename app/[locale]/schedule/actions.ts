"use server";

import { and, eq, gte, lte, sql, between, ne } from "drizzle-orm";
import { db } from "@/app/db/drizzle";
import {
    households,
    foodParcels,
    pickupLocations,
    pickupLocationSchedules,
    pickupLocationScheduleDays,
} from "@/app/db/schema";
import { isTimeAvailable } from "@/app/utils/schedule/location-availability";
import {
    formatStockholmDate,
    toStockholmTime,
    fromStockholmTime,
    generateTimeSlotsBetween,
} from "@/app/utils/date-utils";
import { isDateAvailable, getAvailableTimeRange } from "@/app/utils/schedule/location-availability";
import { unstable_cache } from "next/cache";

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
}

/**
 * Get all pickup locations for the dropdown selector
 */
export async function getPickupLocations(): Promise<PickupLocation[]> {
    try {
        const locations = await db
            .select({
                id: pickupLocations.id,
                name: pickupLocations.name,
                street_address: pickupLocations.street_address,
                maxParcelsPerDay: pickupLocations.parcels_max_per_day,
            })
            .from(pickupLocations);

        return locations;
    } catch (error) {
        console.error("Error fetching pickup locations:", error);
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
        const startDate = weekStart;
        const endDate = weekEnd;

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
            const pickupTimeStockholm = toStockholmTime(new Date(parcel.pickupEarliestTime));
            const pickupDate = new Date(pickupTimeStockholm);
            pickupDate.setHours(0, 0, 0, 0);

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
        const dateInStockholm = toStockholmTime(date);

        const startDateStockholm = new Date(dateInStockholm);
        startDateStockholm.setHours(0, 0, 0, 0);

        const endDateStockholm = new Date(dateInStockholm);
        endDateStockholm.setHours(23, 59, 59, 999);

        // Convert to UTC for database query
        const startDate = fromStockholmTime(startDateStockholm);
        const endDate = fromStockholmTime(endDateStockholm);

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
            const time = toStockholmTime(new Date(parcel.pickupEarliestTime));
            const hour = time.getHours();

            // Round to the nearest slot based on the location's slot duration
            const totalMinutes = time.getMinutes();
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
): Promise<{ success: boolean; error?: string }> {
    try {
        // We'll use a transaction to make the capacity check and update atomic
        // This prevents race conditions where two parallel operations could both pass the capacity check
        return await db.transaction(async tx => {
            // Check if the timeslot is available (not exceeding max capacity)
            const [parcel] = await tx
                .select({
                    locationId: foodParcels.pickup_location_id,
                })
                .from(foodParcels)
                .where(eq(foodParcels.id, parcelId))
                .limit(1);

            if (!parcel) {
                return { success: false, error: "Food parcel not found" };
            }

            // Get the location's max parcels per day and slot duration
            const [location] = await tx
                .select({
                    maxParcelsPerDay: pickupLocations.parcels_max_per_day,
                    slotDuration: pickupLocations.default_slot_duration_minutes,
                })
                .from(pickupLocations)
                .where(eq(pickupLocations.id, parcel.locationId))
                .limit(1);

            // Calculate the correct end time based on the location's slot duration
            const slotDurationMinutes = location.slotDuration;
            const endTime = new Date(newTimeslot.startTime);
            endTime.setMinutes(endTime.getMinutes() + slotDurationMinutes);

            // Check if the location is open at this time using the location-availability utility
            const locationSchedules = await getPickupLocationSchedules(parcel.locationId);
            const startTimeStr = formatStockholmDate(newTimeslot.startTime, "HH:mm");

            // Check if time is within operating hours
            const timeAvailability = isTimeAvailable(
                newTimeslot.date,
                startTimeStr,
                locationSchedules,
            );
            if (!timeAvailability.isAvailable) {
                return {
                    success: false,
                    error:
                        timeAvailability.reason || "The selected time is outside operating hours",
                };
            }

            if (location.maxParcelsPerDay !== null) {
                // Get the date in Stockholm timezone for consistent comparison
                const dateInStockholm = toStockholmTime(newTimeslot.date);

                // Get the start and end of the date in Stockholm timezone
                const startDateStockholm = new Date(dateInStockholm);
                startDateStockholm.setHours(0, 0, 0, 0);

                const endDateStockholm = new Date(dateInStockholm);
                endDateStockholm.setHours(23, 59, 59, 999);

                // Convert to UTC for database query
                const startDate = fromStockholmTime(startDateStockholm);
                const endDate = fromStockholmTime(endDateStockholm);

                // Count food parcels for this date (excluding the one we're updating)
                const [{ count }] = await tx
                    .select({ count: sql<number>`count(*)` })
                    .from(foodParcels)
                    .where(
                        and(
                            eq(foodParcels.pickup_location_id, parcel.locationId),
                            between(foodParcels.pickup_date_time_earliest, startDate, endDate),
                            ne(foodParcels.id, parcelId),
                        ),
                    )
                    .execute();

                if (count >= location.maxParcelsPerDay) {
                    return {
                        success: false,
                        error: `Max capacity (${location.maxParcelsPerDay}) reached for this date`,
                    };
                }
            }

            // Update the food parcel's schedule using the calculated endTime
            await tx
                .update(foodParcels)
                .set({
                    pickup_date_time_earliest: newTimeslot.startTime,
                    pickup_date_time_latest: endTime, // Use our calculated end time
                })
                .where(eq(foodParcels.id, parcelId));

            return { success: true };
        });
    } catch (error) {
        console.error("Error updating food parcel schedule:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}

/**
 * Interface for pickup location schedule information
 */
export interface LocationSchedule {
    id: string;
    name: string;
    startDate: string | Date; // Can be either string or Date to handle DB and UI formats
    endDate: string | Date; // Can be either string or Date to handle DB and UI formats
    days: {
        weekday: string;
        isOpen: boolean;
        openingTime: string | null;
        closingTime: string | null;
    }[];
}

export interface LocationScheduleInfo {
    schedules: LocationSchedule[];
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
                const currentDate = new Date();
                // Use SQL date formatting for correct comparison with database date values
                const currentDateStr = currentDate.toISOString().split("T")[0];

                // Only log in development environment and with explicit debug flag
                const shouldDebug =
                    process.env.NODE_ENV === "development" &&
                    process.env.DEBUG_SCHEDULES === "true";

                if (shouldDebug) {
                    console.log(
                        `[getPickupLocationSchedules] Fetching schedules for location: ${locationId}, current date: ${currentDateStr}`,
                    );
                }

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

                if (shouldDebug) {
                    console.log(`[getPickupLocationSchedules] Found ${schedules.length} schedules`);

                    schedules.forEach(schedule => {
                        console.log(
                            `[getPickupLocationSchedules] Schedule: ${schedule.name}, ${schedule.startDate} - ${schedule.endDate}`,
                        );
                    });
                }

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

                        if (shouldDebug) {
                            console.log(
                                `[getPickupLocationSchedules] Schedule ${schedule.name} has ${days.length} day configurations`,
                            );
                            days.forEach(day => {
                                console.log(
                                    `[getPickupLocationSchedules] Day: ${day.weekday}, isOpen: ${day.isOpen}, hours: ${day.openingTime} - ${day.closingTime}`,
                                );
                            });
                        }

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
            // Cache results for 5 minutes (300 seconds)
            revalidate: 300,
        },
    );

    // IMPORTANT: We need to invoke the cached function, not just return it
    return cachedFetchSchedules();
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

        // Get the day of the week for regular schedule check
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const weekdayNames = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
        ];
        const weekday = weekdayNames[dayOfWeek];

        // Check regular schedules
        for (const schedule of scheduleInfo.schedules) {
            const startDate = new Date(schedule.startDate);
            const endDate = new Date(schedule.endDate);

            // Check if date is within schedule's range
            if (date >= startDate && date <= endDate) {
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

                if (timeValue < openValue || timeValue >= closeValue) {
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
        const dateStr = formatStockholmDate(date, "yyyy-MM-dd");
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.
        const weekdayNames = [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
        ];
        const weekday = weekdayNames[dayOfWeek];

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
                        eq(
                            pickupLocationScheduleDays.weekday,
                            weekday as
                                | "monday"
                                | "tuesday"
                                | "wednesday"
                                | "thursday"
                                | "friday"
                                | "saturday"
                                | "sunday",
                        ),
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
