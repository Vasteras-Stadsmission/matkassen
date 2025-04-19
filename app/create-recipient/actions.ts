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
} from "@/app/db/schema";
import { eq } from "drizzle-orm";
import {
    FormData,
    HouseholdMember,
    DietaryRestriction,
    AdditionalNeed,
    Pet,
    FoodParcel,
    CreateHouseholdResult,
} from "./types";

export async function createHousehold(data: FormData): Promise<CreateHouseholdResult> {
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
                            const [inserted] = await tx
                                .insert(dietaryRestrictions)
                                .values({
                                    name: restriction.name,
                                })
                                .returning();
                            restriction.id = inserted.id;
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
                await tx.insert(pets).values(
                    data.pets.map((pet: any) => ({
                        household_id: householdId,
                        // Handle both potential formats (petSpeciesId or species)
                        pet_species_id: pet.petSpeciesId || pet.species,
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

            return { success: true, householdId };
        });
    } catch (error: unknown) {
        console.error("Error creating household:", error);
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
