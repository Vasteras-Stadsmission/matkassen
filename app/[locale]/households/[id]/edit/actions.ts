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
    householdComments,
} from "@/app/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { FormData } from "../../enroll/types";
import { auth } from "@/auth";
import { fetchGithubUserData, fetchMultipleGithubUserData } from "../../actions";

export interface HouseholdUpdateResult {
    success: boolean;
    householdId?: string;
    error?: string;
}

// Function to format household details from DB format to form format for editing
export async function getHouseholdFormData(householdId: string): Promise<FormData | null> {
    try {
        // Get the household details using the existing function
        const details = await getHouseholdEditData(householdId);

        if (!details) {
            return null;
        }

        // Format the data for the enrollment wizard
        return {
            household: details.household,
            members: details.members.map(member => ({
                id: member.id,
                age: member.age,
                sex: member.sex,
            })),
            dietaryRestrictions: details.dietaryRestrictions,
            additionalNeeds: details.additionalNeeds,
            pets: details.pets,
            foodParcels: {
                pickupLocationId: details.foodParcels.pickupLocationId,
                totalCount: details.foodParcels.totalCount,
                weekday: details.foodParcels.weekday || "1", // Default to Monday if not set
                repeatValue: details.foodParcels.repeatValue || "weekly", // Default to weekly if not set
                startDate: details.foodParcels.startDate || new Date(),
                parcels: details.foodParcels.parcels,
            },
            comments: details.comments,
        };
    } catch (error) {
        console.error("Error getting household form data:", error);
        return null;
    }
}

// Function to get household data for editing
async function getHouseholdEditData(householdId: string) {
    // Get basic household information
    const household = await db
        .select()
        .from(households)
        .where(eq(households.id, householdId))
        .then(results => results[0] || null);

    if (!household) {
        return null;
    }

    // Get household members
    const members = await db
        .select()
        .from(householdMembers)
        .where(eq(householdMembers.household_id, householdId));

    // Get dietary restrictions
    const dietaryRestrictionsData = await db
        .select({
            id: dietaryRestrictions.id,
            name: dietaryRestrictions.name,
        })
        .from(householdDietaryRestrictions)
        .innerJoin(
            dietaryRestrictions,
            eq(householdDietaryRestrictions.dietary_restriction_id, dietaryRestrictions.id),
        )
        .where(eq(householdDietaryRestrictions.household_id, householdId));

    // Get additional needs
    const additionalNeedsData = await db
        .select({
            id: additionalNeeds.id,
            need: additionalNeeds.need,
        })
        .from(householdAdditionalNeeds)
        .innerJoin(
            additionalNeeds,
            eq(householdAdditionalNeeds.additional_need_id, additionalNeeds.id),
        )
        .where(eq(householdAdditionalNeeds.household_id, householdId));

    // Get pets with species names
    const petsData = await db
        .select({
            id: pets.id,
            species: petSpecies.id,
            speciesName: petSpecies.name,
        })
        .from(pets)
        .innerJoin(petSpecies, eq(pets.pet_species_id, petSpecies.id))
        .where(eq(pets.household_id, householdId));

    // Transform pets data to include count by species
    // Group pets by species and count them
    const petsBySpecies: Record<string, { count: number; speciesName: string; ids: string[] }> = {};

    petsData.forEach(pet => {
        if (!petsBySpecies[pet.species]) {
            petsBySpecies[pet.species] = {
                count: 0,
                speciesName: pet.speciesName,
                ids: [],
            };
        }
        petsBySpecies[pet.species].count += 1;
        if (pet.id) {
            petsBySpecies[pet.species].ids.push(pet.id);
        }
    });

    // Convert to array format expected by the form
    const transformedPets = Object.entries(petsBySpecies).map(([species, data]) => ({
        id: data.ids[0] || undefined, // Use the first ID if available
        species,
        speciesName: data.speciesName,
        count: data.count,
    }));

    // Get food parcels with pickup location
    const foodParcelsData = await db
        .select({
            id: foodParcels.id,
            pickupLocationId: foodParcels.pickup_location_id,
            pickupDate: foodParcels.pickup_date_time_earliest,
            pickupEarliestTime: foodParcels.pickup_date_time_earliest,
            pickupLatestTime: foodParcels.pickup_date_time_latest,
            isPickedUp: foodParcels.is_picked_up,
        })
        .from(foodParcels)
        .where(eq(foodParcels.household_id, householdId))
        .orderBy(foodParcels.pickup_date_time_latest);

    // Get comments
    const commentsData = await db
        .select({
            id: householdComments.id,
            comment: householdComments.comment,
            created_at: householdComments.created_at,
            author_github_username: householdComments.author_github_username,
        })
        .from(householdComments)
        .where(eq(householdComments.household_id, householdId))
        .orderBy(householdComments.created_at);

    // Fetch GitHub user data for all comments in one batch
    const usernames = commentsData.map(comment => comment.author_github_username).filter(Boolean);

    const githubUserDataMap = await fetchMultipleGithubUserData(usernames);

    // Attach GitHub user data to comments
    const comments = commentsData.map(comment => {
        const githubUserData = comment.author_github_username
            ? githubUserDataMap[comment.author_github_username] || null
            : null;

        return {
            ...comment,
            githubUserData,
        };
    });

    // Get weekday and repeat pattern (from first food parcel)
    let weekday = "1"; // Default to Monday
    let repeatValue = "weekly"; // Default to weekly
    let startDate = new Date();

    if (foodParcelsData.length > 0) {
        const firstParcelDate = new Date(foodParcelsData[0].pickupDate);
        weekday = firstParcelDate.getDay().toString();
        startDate = firstParcelDate;

        // Try to determine repeat pattern by analyzing intervals between parcels
        if (foodParcelsData.length > 1) {
            const intervals = [];
            for (let i = 1; i < foodParcelsData.length; i++) {
                const prev = new Date(foodParcelsData[i - 1].pickupDate);
                const current = new Date(foodParcelsData[i].pickupDate);
                const daysDiff = Math.round(
                    (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
                );
                intervals.push(daysDiff);
            }

            // Calculate the average interval
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

            if (avgInterval >= 25 && avgInterval <= 35) {
                repeatValue = "monthly";
            } else if (avgInterval >= 12 && avgInterval <= 16) {
                repeatValue = "bi-weekly";
            } else {
                repeatValue = "weekly";
            }
        }
    }

    // Prepare parcels in the format expected by the form
    const parcels = foodParcelsData.map(parcel => ({
        id: parcel.id,
        pickupDate: new Date(parcel.pickupDate),
        pickupEarliestTime: new Date(parcel.pickupEarliestTime),
        pickupLatestTime: new Date(parcel.pickupLatestTime),
        isPickedUp: parcel.isPickedUp,
    }));

    // Format food parcels in a way that the form can use
    const foodParcelsFormatted = {
        pickupLocationId: foodParcelsData.length > 0 ? foodParcelsData[0].pickupLocationId : "",
        totalCount: parcels.length,
        weekday,
        repeatValue,
        startDate,
        parcels,
    };

    // Return complete household details in a format that matches the form's expectations
    return {
        household: {
            first_name: household.first_name,
            last_name: household.last_name,
            phone_number: household.phone_number,
            locale: household.locale,
            postal_code: household.postal_code,
        },
        members: members.map(member => ({
            id: member.id,
            age: member.age,
            sex: member.sex,
        })),
        dietaryRestrictions: dietaryRestrictionsData,
        additionalNeeds: additionalNeedsData,
        pets: transformedPets,
        foodParcels: foodParcelsFormatted,
        comments,
    };
}

// Function to update an existing household
export async function updateHousehold(
    householdId: string,
    data: FormData,
): Promise<HouseholdUpdateResult> {
    try {
        // Start transaction to ensure all related data is updated atomically
        return await db.transaction(async tx => {
            // 1. Update the household basic information
            await tx
                .update(households)
                .set({
                    first_name: data.household.first_name,
                    last_name: data.household.last_name,
                    phone_number: data.household.phone_number,
                    locale: data.household.locale,
                    postal_code: data.household.postal_code,
                })
                .where(eq(households.id, householdId));

            // 2. Handle household members - first delete existing members
            await tx.delete(householdMembers).where(eq(householdMembers.household_id, householdId));

            // Then add updated members
            if (data.members && data.members.length > 0) {
                await tx.insert(householdMembers).values(
                    data.members.map(member => ({
                        household_id: householdId,
                        age: member.age,
                        sex: member.sex as "male" | "female" | "other",
                    })),
                );
            }

            // 3. Handle dietary restrictions - first delete existing restrictions
            await tx
                .delete(householdDietaryRestrictions)
                .where(eq(householdDietaryRestrictions.household_id, householdId));

            // Then add updated restrictions
            if (data.dietaryRestrictions && data.dietaryRestrictions.length > 0) {
                // First, ensure all dietary restrictions exist in the database
                for (const restriction of data.dietaryRestrictions) {
                    // Check if the restriction exists
                    const [existingRestriction] = await tx
                        .select()
                        .from(dietaryRestrictions)
                        .where(eq(dietaryRestrictions.id, restriction.id))
                        .limit(1);

                    // If not found, create it
                    if (!existingRestriction) {
                        const [newRestriction] = await tx
                            .insert(dietaryRestrictions)
                            .values({
                                name: restriction.name,
                            })
                            .returning();
                        restriction.id = newRestriction.id;
                    }
                }

                // Then link restrictions to the household
                await tx.insert(householdDietaryRestrictions).values(
                    data.dietaryRestrictions.map(restriction => ({
                        household_id: householdId,
                        dietary_restriction_id: restriction.id,
                    })),
                );
            }

            // 4. Handle pets - first delete existing pets
            await tx.delete(pets).where(eq(pets.household_id, householdId));

            // Then add updated pets
            if (data.pets && data.pets.length > 0) {
                // First, ensure all pet species exist in the database
                for (const pet of data.pets) {
                    // Check if the species exists
                    let existingPetSpecies: { id: string; name: string } | undefined;

                    if (pet.species) {
                        [existingPetSpecies] = await tx
                            .select()
                            .from(petSpecies)
                            .where(eq(petSpecies.id, pet.species))
                            .limit(1);
                    }

                    // If not found and we have a species name, create it
                    if (!existingPetSpecies && pet.speciesName) {
                        const [existingByName] = await tx
                            .select()
                            .from(petSpecies)
                            .where(eq(petSpecies.name, pet.speciesName))
                            .limit(1);

                        if (existingByName) {
                            pet.species = existingByName.id;
                        } else {
                            await tx
                                .insert(petSpecies)
                                .values({
                                    id: pet.species,
                                    name: pet.speciesName,
                                })
                                .returning();
                        }
                    }
                }

                // Then add pets to the database
                await tx.insert(pets).values(
                    data.pets.map(pet => ({
                        household_id: householdId,
                        pet_species_id: pet.species,
                    })),
                );
            }

            // 5. Handle additional needs - first delete existing needs
            await tx
                .delete(householdAdditionalNeeds)
                .where(eq(householdAdditionalNeeds.household_id, householdId));

            // Then add updated needs
            if (data.additionalNeeds && data.additionalNeeds.length > 0) {
                // First, ensure all additional needs exist in the database
                const customNeeds = data.additionalNeeds.filter(n => n.isCustom);

                for (const need of customNeeds) {
                    const [existingNeed] = await tx
                        .select()
                        .from(additionalNeeds)
                        .where(eq(additionalNeeds.need, need.need))
                        .limit(1);

                    // If not found, create it
                    if (!existingNeed) {
                        await tx.insert(additionalNeeds).values({
                            id: need.id,
                            need: need.need,
                        });
                    }
                }

                // Then link needs to the household
                await tx.insert(householdAdditionalNeeds).values(
                    data.additionalNeeds.map(need => ({
                        household_id: householdId,
                        additional_need_id: need.id,
                    })),
                );
            }

            // 6. Handle food parcels - first delete future food parcels
            // Keep past parcels (that have been picked up) to maintain history
            const now = new Date();
            await tx
                .delete(foodParcels)
                .where(
                    and(
                        eq(foodParcels.household_id, householdId),
                        eq(foodParcels.is_picked_up, false),
                        gt(foodParcels.pickup_date_time_earliest, now),
                    ),
                );

            // Then add new food parcels
            if (data.foodParcels.parcels && data.foodParcels.parcels.length > 0) {
                // Filter parcels to only include future ones
                const futureParcels = data.foodParcels.parcels
                    .filter(parcel => new Date(parcel.pickupEarliestTime) > now)
                    .map(parcel => ({
                        household_id: householdId,
                        pickup_location_id: data.foodParcels.pickupLocationId,
                        pickup_date_time_earliest: parcel.pickupEarliestTime,
                        pickup_date_time_latest: parcel.pickupLatestTime,
                        is_picked_up: false,
                    }));

                // Only insert if there are future parcels
                if (futureParcels.length > 0) {
                    await tx.insert(foodParcels).values(futureParcels);
                }
            }

            // 7. Handle comments - add new comments if any were added during editing
            if (data.comments && data.comments.length > 0) {
                // Filter out any comments that already have an ID (meaning they already exist in the DB)
                // and only add the ones that don't have an ID (new comments added during editing)
                const newComments = data.comments.filter(c => !c.id && c.comment.trim() !== "");

                if (newComments.length > 0) {
                    await Promise.all(
                        newComments.map(comment =>
                            tx.insert(householdComments).values({
                                household_id: householdId,
                                comment: comment.comment.trim(),
                                author_github_username:
                                    comment.author_github_username || "anonymous",
                            }),
                        ),
                    );
                }
            }

            return { success: true, householdId };
        });
    } catch (error: unknown) {
        console.error("Error updating household:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error occurred",
        };
    }
}

// Add comment to a household (for edit page)
export async function addComment(householdId: string, commentText: string) {
    if (!commentText.trim()) return null;

    try {
        // Get the current user from the session
        const session = await auth();
        const username = session?.user?.name || "anonymous";

        // Insert the comment
        const [comment] = await db
            .insert(householdComments)
            .values({
                household_id: householdId,
                comment: commentText.trim(),
                author_github_username: username,
            })
            .returning();

        // Fetch GitHub user data for the comment author
        let githubUserData = null;
        if (username && username !== "anonymous") {
            githubUserData = await fetchGithubUserData(username);
        }

        // Return the comment with GitHub user data
        return {
            ...comment,
            githubUserData,
        };
    } catch (error) {
        console.error("Error adding comment:", error);
        return null;
    }
}
