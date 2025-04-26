"use server";

import { db } from "@/app/db/drizzle";
import {
    households,
    householdMembers,
    householdDietaryRestrictions,
    dietaryRestrictions,
    householdAdditionalNeeds,
    additionalNeeds,
    pets,
    petSpecies,
    foodParcels,
    pickupLocations,
    householdComments,
} from "@/app/db/schema";
import { eq, sql, and } from "drizzle-orm";
import {
    FormData,
    HouseholdMember,
    DietaryRestriction,
    AdditionalNeed,
    FoodParcel,
    EnrollHouseholdResult,
} from "./types";

export async function enrollHousehold(data: FormData): Promise<EnrollHouseholdResult> {
    try {
        // Start transaction to ensure all related data is created atomically
        return await db.transaction(async tx => {
            // 1. Create the household
            const [household] = await tx
                .insert(households)
                .values({
                    first_name: data.household.first_name,
                    last_name: data.household.last_name,
                    phone_number: data.household.phone_number,
                    locale: data.household.locale || "sv",
                    postal_code: data.household.postal_code,
                })
                .returning();

            const householdId = household.id;

            // 2. Add household members
            if (data.members.length > 0) {
                await tx.insert(householdMembers).values(
                    data.members.map((member: HouseholdMember) => ({
                        household_id: householdId,
                        age: member.age,
                        sex: member.sex as "male" | "female" | "other",
                    })),
                );
            }

            // 3. Add dietary restrictions
            if (data.dietaryRestrictions.length > 0) {
                // First, ensure all dietary restrictions exist in the database
                for (const restriction of data.dietaryRestrictions) {
                    // Check if the dietary restriction already exists
                    const [existingRestriction] = await tx
                        .select()
                        .from(dietaryRestrictions)
                        .where(eq(dietaryRestrictions.id, restriction.id))
                        .limit(1);

                    // If not found by ID, check by name (for dummy data with r1, r2, etc.)
                    if (!existingRestriction) {
                        const [existingByName] = await tx
                            .select()
                            .from(dietaryRestrictions)
                            .where(eq(dietaryRestrictions.name, restriction.name))
                            .limit(1);

                        // If found by name, use its ID instead
                        if (existingByName) {
                            restriction.id = existingByName.id;
                        } else {
                            // If not found at all, insert a new entry
                            const [newRestriction] = await tx
                                .insert(dietaryRestrictions)
                                .values({
                                    name: restriction.name,
                                })
                                .returning();
                            restriction.id = newRestriction.id;
                        }
                    }
                }

                // Then link all restrictions to the household
                await tx.insert(householdDietaryRestrictions).values(
                    data.dietaryRestrictions.map((restriction: DietaryRestriction) => ({
                        household_id: householdId,
                        dietary_restriction_id: restriction.id,
                    })),
                );
            }

            // 4. Add pets
            if (data.pets.length > 0) {
                // First, ensure all pet species exist in the database
                for (const pet of data.pets) {
                    // Check if the pet species already exists
                    let existingPetSpecies: { id: string; name: string } | undefined;

                    if (pet.species) {
                        [existingPetSpecies] = await tx
                            .select()
                            .from(petSpecies)
                            .where(eq(petSpecies.id, pet.species))
                            .limit(1);
                    }

                    // If not found by ID, check by name (in case it's a new species)
                    if (!existingPetSpecies && pet.speciesName) {
                        const [existingByName] = await tx
                            .select()
                            .from(petSpecies)
                            .where(eq(petSpecies.name, pet.speciesName))
                            .limit(1);

                        // If found by name, use its ID instead
                        if (existingByName) {
                            pet.species = existingByName.id;
                        } else {
                            // If not found at all, insert a new entry
                            await tx
                                .insert(petSpecies)
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
                await tx.insert(pets).values(
                    data.pets.map(pet => ({
                        household_id: householdId,
                        pet_species_id: pet.species,
                    })),
                );
            }

            // 5. Add additional needs
            if (data.additionalNeeds.length > 0) {
                // First, create any new additional needs that don't exist yet
                const customNeeds = data.additionalNeeds.filter((n: AdditionalNeed) => n.isCustom);

                for (const need of customNeeds) {
                    const [existingNeed] = await tx
                        .select()
                        .from(additionalNeeds)
                        .where(eq(additionalNeeds.need, need.need))
                        .limit(1);

                    if (!existingNeed) {
                        await tx.insert(additionalNeeds).values({
                            id: need.id,
                            need: need.need,
                        });
                    }
                }

                // Then link all needs to the household
                await tx.insert(householdAdditionalNeeds).values(
                    data.additionalNeeds.map((need: AdditionalNeed) => ({
                        household_id: householdId,
                        additional_need_id: need.id,
                    })),
                );
            }

            // 6. Add food parcels
            if (data.foodParcels.parcels && data.foodParcels.parcels.length > 0) {
                await tx.insert(foodParcels).values(
                    data.foodParcels.parcels.map((parcel: FoodParcel) => ({
                        household_id: householdId,
                        pickup_location_id: data.foodParcels.pickupLocationId,
                        pickup_date_time_earliest: parcel.pickupEarliestTime,
                        pickup_date_time_latest: parcel.pickupLatestTime,
                        is_picked_up: false,
                    })),
                );
            }

            // 7. Add comments
            if (data.comments && data.comments.length > 0) {
                await Promise.all(
                    data.comments
                        .filter(comment => comment.comment.trim() !== "")
                        .map(comment =>
                            tx.insert(householdComments).values({
                                household_id: householdId,
                                comment: comment.comment.trim(),
                                author_github_username:
                                    comment.author_github_username || "anonymous",
                            }),
                        ),
                );
            }

            return { success: true, householdId };
        });
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
        return await db.select().from(dietaryRestrictions);
    } catch (error) {
        console.error("Error fetching dietary restrictions:", error);
        return [];
    }
}

// Helper function to get all additional needs
export async function getAdditionalNeeds() {
    try {
        return await db.select().from(additionalNeeds);
    } catch (error) {
        console.error("Error fetching additional needs:", error);
        return [];
    }
}

// Helper function to get all pickup locations
export async function getPickupLocations() {
    try {
        return await db.select().from(pickupLocations);
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
        return await db.select().from(petSpecies);
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
            .from(pickupLocations)
            .where(eq(pickupLocations.id, locationId))
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
            .from(pickupLocations)
            .where(eq(pickupLocations.id, locationId))
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
