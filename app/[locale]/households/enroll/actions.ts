"use server";

import { db } from "@/app/db/drizzle";
import {
    households,
    foodParcels,
    householdMembers,
    dietaryRestrictions as dietaryRestrictionsTable,
    householdDietaryRestrictions as householdDietaryRestrictionsTable,
    additionalNeeds as additionalNeedsTable,
    householdAdditionalNeeds as householdAdditionalNeedsTable,
    petSpecies as petSpeciesTable,
    pets as petsTable,
    pickupLocations as pickupLocationsTable,
    pickupLocationSchedules as pickupLocationSchedulesTable,
    pickupLocationScheduleDays as pickupLocationScheduleDaysTable,
} from "@/app/db/schema";
import { eq, and, sql } from "drizzle-orm";

import {
    HouseholdCreateData,
    FoodParcelCreateData,
    HouseholdMemberData,
    DietaryRestrictionData,
    AdditionalNeedData,
} from "./types";

export async function enrollHousehold(data: HouseholdCreateData) {
    "use server";

    try {
        // 1. Create household
        const [household] = await db
            .insert(households)
            .values({
                first_name: data.headOfHousehold.firstName,
                last_name: data.headOfHousehold.lastName,
                phone_number: data.headOfHousehold.phoneNumber,
                locale: data.headOfHousehold.locale || "sv",
                postal_code: data.headOfHousehold.postalCode,
            })
            .returning();

        // 2. Add household members
        if (data.members && data.members.length > 0) {
            await db.insert(householdMembers).values(
                data.members.map((member: HouseholdMemberData) => ({
                    household_id: household.id,
                    first_name: member.firstName,
                    last_name: member.lastName,
                    age: member.age,
                    sex: member.sex as "male" | "female" | "other",
                })),
            );
        }

        // 3. Add dietary restrictions
        if (data.dietaryRestrictions && data.dietaryRestrictions.length > 0) {
            // First, ensure all dietary restrictions exist in the database
            for (const restriction of data.dietaryRestrictions) {
                // Check if the dietary restriction already exists
                const [existingRestriction] = await db
                    .select()
                    .from(dietaryRestrictionsTable)
                    .where(eq(dietaryRestrictionsTable.id, restriction.id))
                    .limit(1);

                // If not found by ID, check by name (for dummy data with r1, r2, etc.)
                if (!existingRestriction) {
                    const [existingByName] = await db
                        .select()
                        .from(dietaryRestrictionsTable)
                        .where(eq(dietaryRestrictionsTable.name, restriction.name))
                        .limit(1);

                    // If found by name, use its ID instead
                    if (existingByName) {
                        restriction.id = existingByName.id;
                    } else {
                        // If not found at all, insert a new entry
                        const [newRestriction] = await db
                            .insert(dietaryRestrictionsTable)
                            .values({
                                name: restriction.name,
                            })
                            .returning();
                        restriction.id = newRestriction.id;
                    }
                }
            }

            // Then link all restrictions to the household
            await db.insert(householdDietaryRestrictionsTable).values(
                data.dietaryRestrictions.map((restriction: DietaryRestrictionData) => ({
                    household_id: household.id,
                    dietary_restriction_id: restriction.id,
                })),
            );
        }

        // 4. Add pets
        if (data.pets && data.pets.length > 0) {
            // First, ensure all pet species exist in the database
            for (const pet of data.pets) {
                // Check if the pet species already exists
                let existingPetSpecies: { id: string; name: string } | undefined;

                if (pet.species) {
                    [existingPetSpecies] = await db
                        .select()
                        .from(petSpeciesTable)
                        .where(eq(petSpeciesTable.id, pet.species))
                        .limit(1);
                }

                // If not found by ID, check by name (in case it's a new species)
                if (!existingPetSpecies && pet.speciesName) {
                    const [existingByName] = await db
                        .select()
                        .from(petSpeciesTable)
                        .where(eq(petSpeciesTable.name, pet.speciesName))
                        .limit(1);

                    // If found by name, use its ID instead
                    if (existingByName) {
                        pet.species = existingByName.id;
                    } else {
                        // If not found at all, insert a new entry
                        await db
                            .insert(petSpeciesTable)
                            .values({
                                id: pet.species,
                                name: pet.speciesName,
                            })
                            .returning();

                        // Species ID stays the same since we're inserting with the provided ID
                    }
                }
            }

            // Then add all pets to the database
            await db.insert(petsTable).values(
                data.pets.map((pet: { species: string; speciesName?: string; count?: number }) => ({
                    household_id: household.id,
                    pet_species_id: pet.species,
                })),
            );
        }

        // 5. Add additional needs
        if (data.additionalNeeds && data.additionalNeeds.length > 0) {
            // First, create any new additional needs that don't exist yet
            const customNeeds = data.additionalNeeds.filter((n: AdditionalNeedData) => n.isCustom);

            for (const need of customNeeds) {
                const [existingNeed] = await db
                    .select()
                    .from(additionalNeedsTable)
                    .where(eq(additionalNeedsTable.need, need.need))
                    .limit(1);

                if (!existingNeed) {
                    await db.insert(additionalNeedsTable).values({
                        id: need.id,
                        need: need.need,
                    });
                }
            }

            // Then link all needs to the household
            await db.insert(householdAdditionalNeedsTable).values(
                data.additionalNeeds.map((need: AdditionalNeedData) => ({
                    household_id: household.id,
                    additional_need_id: need.id,
                })),
            );
        }

        // 6. Add food parcels
        if (data.foodParcels && data.foodParcels.parcels && data.foodParcels.parcels.length > 0) {
            await db.insert(foodParcels).values(
                data.foodParcels.parcels.map((parcel: FoodParcelCreateData) => ({
                    household_id: household.id,
                    pickup_location_id: data.foodParcels.pickupLocationId,
                    pickup_date_time_earliest: parcel.pickupEarliestTime,
                    pickup_date_time_latest: parcel.pickupLatestTime,
                    is_picked_up: false,
                })),
            );
        }

        return { success: true, householdId: household.id };
    } catch (error: unknown) {
        console.error("Error enrolling household:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}

// Helper function to get all dietary restrictions
export async function getDietaryRestrictions() {
    try {
        return await db.select().from(dietaryRestrictionsTable);
    } catch (error) {
        console.error("Error fetching dietary restrictions:", error);
        return [];
    }
}

// Helper function to get all additional needs
export async function getAdditionalNeeds() {
    try {
        return await db.select().from(additionalNeedsTable);
    } catch (error) {
        console.error("Error fetching additional needs:", error);
        return [];
    }
}

// Helper function to get all pickup locations
export async function getPickupLocations() {
    try {
        return await db.select().from(pickupLocationsTable);
    } catch (error) {
        console.error("Error fetching pickup locations:", error);
        return [];
    }
}

/**
 * Fetches all available pet species from the database
 * @returns Array of pet species
 */
export async function getPetSpecies() {
    try {
        return await db.select().from(petSpeciesTable);
    } catch (error) {
        console.error("Error fetching pet species:", error);
        return [];
    }
}

/**
 * Check if a pickup location has reached its maximum capacity for a specific date
 * @param locationId Pickup location ID
 * @param date Date to check
 * @param excludeHouseholdId Optional household ID to exclude from the count
 * @returns Object containing isAvailable and info about capacity
 */
export async function checkPickupLocationCapacity(
    locationId: string,
    date: Date,
    excludeHouseholdId?: string,
) {
    try {
        // Get the location to check if it has a max parcels per day limit
        const [location] = await db
            .select()
            .from(pickupLocationsTable)
            .where(eq(pickupLocationsTable.id, locationId))
            .limit(1);

        // If location doesn't exist or has no limit, return available
        if (!location || location.parcels_max_per_day === null) {
            return {
                isAvailable: true,
                currentCount: 0,
                maxCount: null,
                message: "Ingen gräns för denna hämtplats",
            };
        }

        // Format date for correct comparison (remove time part)
        const dateOnly = new Date(date);
        dateOnly.setHours(0, 0, 0, 0);

        // Extract the year, month, and day from the date for comparison
        const year = dateOnly.getFullYear();
        const month = dateOnly.getMonth() + 1; // getMonth() returns 0-11
        const day = dateOnly.getDate();

        // Use raw SQL for a more precise date comparison that handles timezone information
        // This extracts year, month, and day from the timestamp to perform the comparison
        // regardless of time part or timezone
        const whereConditions = [eq(foodParcels.pickup_location_id, locationId)];

        // Add date comparison conditions
        whereConditions.push(
            eq(sql`EXTRACT(YEAR FROM ${foodParcels.pickup_date_time_earliest})::int`, year),
            eq(sql`EXTRACT(MONTH FROM ${foodParcels.pickup_date_time_earliest})::int`, month),
            eq(sql`EXTRACT(DAY FROM ${foodParcels.pickup_date_time_earliest})::int`, day),
        );

        // Exclude the current household's parcels if we're editing an existing household
        if (excludeHouseholdId) {
            whereConditions.push(sql`${foodParcels.household_id} != ${excludeHouseholdId}`);
        }

        // Execute the query with all conditions
        const parcels = await db
            .select()
            .from(foodParcels)
            .where(and(...whereConditions));

        // Count the parcels
        const parcelCount = parcels.length;
        const isAvailable = parcelCount < location.parcels_max_per_day;

        // Return availability info
        return {
            isAvailable,
            currentCount: parcelCount,
            maxCount: location.parcels_max_per_day,
            message: isAvailable
                ? `${parcelCount} av ${location.parcels_max_per_day} bokade`
                : `Max antal (${location.parcels_max_per_day}) matkassar bokade för detta datum`,
        };
    } catch (error) {
        console.error("Error checking pickup location capacity:", error);
        // Default to available in case of error, with a warning message
        return {
            isAvailable: true,
            currentCount: 0,
            maxCount: null,
            message: "Kunde inte kontrollera kapacitet",
        };
    }
}

/**
 * Get capacity data for a range of dates in a single query
 * @param locationId Pickup location ID
 * @param startDate Start date of the range
 * @param endDate End date of the range
 * @returns Object containing capacity data for the range
 */
export async function getPickupLocationCapacityForRange(
    locationId: string,
    startDate: Date,
    endDate: Date,
) {
    try {
        // Get the location to check if it has a max parcels per day limit
        const [location] = await db
            .select()
            .from(pickupLocationsTable)
            .where(eq(pickupLocationsTable.id, locationId))
            .limit(1);

        // If location doesn't exist or has no limit, return null
        if (!location || location.parcels_max_per_day === null) {
            return {
                hasLimit: false,
                maxPerDay: null,
                dateCapacities: {},
            };
        }

        // Format dates for comparison
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);

        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        // Get all food parcels for this location within the date range
        const parcels = await db
            .select({
                pickupDateEarliest: foodParcels.pickup_date_time_earliest,
            })
            .from(foodParcels)
            .where(
                and(
                    eq(foodParcels.pickup_location_id, locationId),
                    sql`${foodParcels.pickup_date_time_earliest} >= ${start.toISOString()}`,
                    sql`${foodParcels.pickup_date_time_earliest} <= ${end.toISOString()}`,
                ),
            );

        // Count parcels by date
        const dateCountMap: Record<string, number> = {};

        parcels.forEach(parcel => {
            const date = new Date(parcel.pickupDateEarliest);
            // Format to YYYY-MM-DD for consistent comparison
            const dateKey = date.toISOString().split("T")[0];

            if (!dateCountMap[dateKey]) {
                dateCountMap[dateKey] = 0;
            }

            dateCountMap[dateKey]++;
        });

        // Return capacity info for all dates
        return {
            hasLimit: true,
            maxPerDay: location.parcels_max_per_day,
            dateCapacities: dateCountMap,
        };
    } catch (error) {
        console.error("Error checking pickup location capacity range:", error);
        return {
            hasLimit: false,
            maxPerDay: null,
            dateCapacities: {},
        };
    }
}

/**
 * Get active and upcoming schedules for a pickup location
 * @param locationId Pickup location ID
 * @returns Array of schedules with their opening days
 */
export async function getPickupLocationSchedules(locationId: string) {
    try {
        const currentDate = new Date();
        // Use SQL date formatting for correct comparison with database date values
        const currentDateStr = currentDate.toISOString().split("T")[0];

        // Get all current and upcoming schedules for this location
        // (end_date is in the future - this includes both active and upcoming schedules)
        const schedules = await db
            .select({
                id: pickupLocationSchedulesTable.id,
                name: pickupLocationSchedulesTable.name,
                startDate: pickupLocationSchedulesTable.start_date,
                endDate: pickupLocationSchedulesTable.end_date,
            })
            .from(pickupLocationSchedulesTable)
            .where(
                and(
                    eq(pickupLocationSchedulesTable.pickup_location_id, locationId),
                    sql`${pickupLocationSchedulesTable.end_date} >= ${currentDateStr}::date`,
                ),
            );

        // For each schedule, get the days it's active
        const schedulesWithDays = await Promise.all(
            schedules.map(async schedule => {
                const days = await db
                    .select({
                        weekday: pickupLocationScheduleDaysTable.weekday,
                        isOpen: pickupLocationScheduleDaysTable.is_open,
                        openingTime: pickupLocationScheduleDaysTable.opening_time,
                        closingTime: pickupLocationScheduleDaysTable.closing_time,
                    })
                    .from(pickupLocationScheduleDaysTable)
                    .where(eq(pickupLocationScheduleDaysTable.schedule_id, schedule.id));

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
