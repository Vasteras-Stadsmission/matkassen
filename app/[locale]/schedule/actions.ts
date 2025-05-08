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
import { formatStockholmDate, toStockholmTime, fromStockholmTime } from "@/app/utils/date-utils";
import { isDateAvailable, getAvailableTimeRange } from "@/app/utils/schedule/location-availability";

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

        // Count parcels by time slot (30-minute slots) using Stockholm time
        const timeslotCounts: Record<string, number> = {};

        parcels.forEach(parcel => {
            const time = toStockholmTime(new Date(parcel.pickupEarliestTime));
            const hour = time.getHours();
            const minutes = time.getMinutes() < 30 ? 0 : 30;
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

            // Get the location's max parcels per day
            const [location] = await tx
                .select({
                    maxParcelsPerDay: pickupLocations.parcels_max_per_day,
                })
                .from(pickupLocations)
                .where(eq(pickupLocations.id, parcel.locationId))
                .limit(1);

            // Check if the location is open at this time using the location-availability utility
            const locationSchedules = await getPickupLocationSchedules(parcel.locationId);
            const startTimeStr = formatStockholmDate(newTimeslot.startTime, "HH:mm");

            // Import isDateAvailable and isTimeAvailable from our utility
            const { isTimeAvailable } = await import("@/app/utils/schedule/location-availability");

            // Then check if time is within operating hours
            const timeAvailability = isTimeAvailable(
                newTimeslot.date,
                startTimeStr,
                locationSchedules,
            );
            if (!timeAvailability.isAvailable) {
                return {
                    success: false,
                    error:
                        timeAvailability.message || "The selected time is outside operating hours",
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

            // Update the food parcel's schedule
            // Since we're in a transaction, this won't commit until all checks have passed
            await tx
                .update(foodParcels)
                .set({
                    pickup_date_time_earliest: newTimeslot.startTime,
                    pickup_date_time_latest: newTimeslot.endTime,
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
export async function getPickupLocationSchedules(
    locationId: string,
): Promise<LocationScheduleInfo> {
    try {
        const currentDate = new Date();
        // Use SQL date formatting for correct comparison with database date values
        const currentDateStr = currentDate.toISOString().split("T")[0];

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
}

/**
 * Check if a pickup location is open on a specific date and time
 */
export async function checkLocationAvailability(
    locationId: string,
    date: Date,
    time: string,
): Promise<{ isAvailable: boolean; message?: string }> {
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
                        message: `This location is only open from ${dayConfig.openingTime} to ${dayConfig.closingTime} on ${weekday}s`,
                    };
                }

                return { isAvailable: true };
            }
        }

        // If no schedule is found for this date, it's unavailable
        return {
            isAvailable: false,
            message: "This location has no scheduled opening hours for this date",
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
        // Fetch the location with its schedules
        const locationData = await getLocationWithSchedules(locationId);

        if (!locationData) {
            throw new Error("Location not found");
        }

        // Generate day info for each day in the week
        const days: DayInfo[] = week.map(date => {
            const availability = isDateAvailable(date, locationData);

            return {
                date,
                isAvailable: availability.isAvailable,
                unavailableReason: availability.isAvailable ? undefined : availability.message,
            };
        });

        // Generate timeslots based on the location's schedule
        // Get the first available day to determine time slots
        const availableDay = days.find(day => day.isAvailable);
        let timeslots: string[] = [];

        if (availableDay) {
            const timeRange = getAvailableTimeRange(availableDay.date, locationData);

            if (timeRange.earliestTime && timeRange.latestTime) {
                // Parse times
                const [startHour, startMinute] = timeRange.earliestTime.split(":").map(Number);
                const [endHour, endMinute] = timeRange.latestTime.split(":").map(Number);

                // Round up to the nearest 30-minute interval if needed
                let currentHour = startHour;
                let currentMinute = startMinute;

                if (currentMinute > 0 && currentMinute < 30) {
                    currentMinute = 30;
                } else if (currentMinute > 30) {
                    currentHour += 1;
                    currentMinute = 0;
                }

                // Generate all possible 30-minute slots during open hours
                while (
                    currentHour < endHour ||
                    (currentHour === endHour && currentMinute <= endMinute - 30)
                ) {
                    const timeString = `${currentHour.toString().padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;
                    timeslots.push(timeString);

                    // Advance to next time slot
                    currentMinute += 30;
                    if (currentMinute >= 60) {
                        currentHour += 1;
                        currentMinute = 0;
                    }
                }
            }
        }

        // If no timeslots were generated, use default ones
        if (timeslots.length === 0) {
            timeslots = [
                "09:00",
                "09:30",
                "10:00",
                "10:30",
                "11:00",
                "11:30",
                "12:00",
                "12:30",
                "13:00",
                "13:30",
                "14:00",
                "14:30",
                "15:00",
                "15:30",
                "16:00",
                "16:30",
                "17:00",
                "17:30",
            ];
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
