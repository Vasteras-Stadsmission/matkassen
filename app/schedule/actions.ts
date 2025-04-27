"use server";

import { db } from "@/app/db/drizzle";
import { foodParcels, households, pickupLocations } from "@/app/db/schema";
import { and, between, eq, sql } from "drizzle-orm";

export interface FoodParcel {
    id: string;
    householdId: string;
    householdName: string;
    pickupDate: Date;
    pickupEarliestTime: Date;
    pickupLatestTime: Date;
    isPickedUp: boolean;
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
        // Get start and end of the week (Monday to Sunday)
        const startDate = new Date(weekStart);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(weekEnd);
        endDate.setHours(23, 59, 59, 999);

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

        // Transform the data to the expected format
        return parcelsData.map(parcel => {
            const pickupDate = new Date(parcel.pickupEarliestTime);
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
        // Get start and end of the date
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);

        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

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

        // Count parcels by time slot (30-minute slots)
        const timeslotCounts: Record<string, number> = {};

        parcels.forEach(parcel => {
            const time = new Date(parcel.pickupEarliestTime);
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
        // Check if the timeslot is available (not exceeding max capacity)
        const [parcel] = await db
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
        const [location] = await db
            .select({
                maxParcelsPerDay: pickupLocations.parcels_max_per_day,
            })
            .from(pickupLocations)
            .where(eq(pickupLocations.id, parcel.locationId))
            .limit(1);

        if (location.maxParcelsPerDay !== null) {
            // Get the number of parcels for this date (excluding the current one)
            const startDate = new Date(newTimeslot.date);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(newTimeslot.date);
            endDate.setHours(23, 59, 59, 999);

            const parcelsCount = await db
                .select({
                    count: sql<number>`count(*)`,
                })
                .from(foodParcels)
                .where(
                    and(
                        eq(foodParcels.pickup_location_id, parcel.locationId),
                        between(foodParcels.pickup_date_time_earliest, startDate, endDate),
                        sql`${foodParcels.id} != ${parcelId}`,
                    ),
                );

            const count = parcelsCount[0]?.count || 0;

            if (count >= location.maxParcelsPerDay) {
                return {
                    success: false,
                    error: `Max capacity (${location.maxParcelsPerDay}) reached for this date`,
                };
            }
        }

        // Update the food parcel's schedule
        await db
            .update(foodParcels)
            .set({
                pickup_date_time_earliest: newTimeslot.startTime,
                pickup_date_time_latest: newTimeslot.endTime,
            })
            .where(eq(foodParcels.id, parcelId));

        return { success: true };
    } catch (error) {
        console.error("Error updating food parcel schedule:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}

/**
 * Get ISO week number for a date
 */
export async function getISOWeekNumber(date: Date): Promise<number> {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNumber = Math.floor(1 + 0.5 + (d.getTime() - yearStart.getTime()) / 86400000 / 7);
    return weekNumber;
}

/**
 * Get the start and end dates of the ISO week containing the given date
 */
export async function getWeekDates(date: Date): Promise<{ start: Date; end: Date }> {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday

    const start = new Date(d.setDate(diff));
    start.setHours(0, 0, 0, 0);

    const end = new Date(d);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}
