"use server";

import { db } from "@/app/db/drizzle";
import { foodParcels, households, pickupLocations } from "@/app/db/schema";
import { and, between, eq, ne, sql } from "drizzle-orm";
import { fromStockholmTime, toStockholmTime } from "@/app/utils/date-utils";

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

                // Using FOR UPDATE to lock the rows we're counting
                // This ensures serializable isolation for this capacity check
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
                    .for("update") // Postgres row-lock
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
