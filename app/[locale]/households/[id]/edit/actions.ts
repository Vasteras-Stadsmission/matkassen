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
    users,
} from "@/app/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { FormData, GithubUserData } from "../../enroll/types";
import { protectedHouseholdAction, protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { type AuthSession } from "@/app/utils/auth/server-action-auth";
import { notDeleted } from "@/app/db/query-helpers";
import { calculateParcelOperations } from "./calculateParcelOperations";
import { logger, logError } from "@/app/utils/logger";
import { normalizePostalCode } from "@/app/utils/validation/household-validation";

export interface HouseholdUpdateResult {
    success: boolean;
    householdId?: string;
    error?: string;
}

// Function to format household details from DB format to form format for editing
export const getHouseholdFormData = protectedAction(
    async (session: AuthSession, householdId: string): Promise<ActionResult<FormData>> => {
        try {
            // Auth already verified by protectedAction wrapper
            // Get the household details using the existing function
            const details = await getHouseholdEditData(householdId);

            if (!details) {
                return failure({
                    code: "NOT_FOUND",
                    message: "Household not found",
                });
            }

            // Format the data for the enrollment wizard
            return success({
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
                    parcels: details.foodParcels.parcels,
                },
                comments: details.comments,
            });
        } catch (error) {
            logError("Error getting household form data", error, {
                action: "getHouseholdFormData",
                householdId,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: "Failed to load household data",
            });
        }
    },
);

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
        .where(and(eq(foodParcels.household_id, householdId), notDeleted()))
        .orderBy(foodParcels.pickup_date_time_latest);

    // Get comments
    const commentsData = await db
        .select({
            id: householdComments.id,
            comment: householdComments.comment,
            created_at: householdComments.created_at,
            author_github_username: householdComments.author_github_username,
            author_display_name: users.display_name,
            author_avatar_url: users.avatar_url,
        })
        .from(householdComments)
        .leftJoin(users, eq(householdComments.author_github_username, users.github_username))
        .where(eq(householdComments.household_id, householdId))
        .orderBy(householdComments.created_at);

    // Map comments with user data from DB
    const comments = commentsData.map(comment => ({
        id: comment.id,
        comment: comment.comment,
        created_at: comment.created_at,
        author_github_username: comment.author_github_username,
        githubUserData:
            comment.author_display_name || comment.author_avatar_url
                ? {
                      name: comment.author_display_name,
                      avatar_url: comment.author_avatar_url,
                  }
                : null,
    }));

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
export const updateHousehold = protectedHouseholdAction(
    async (session, household, data: FormData): Promise<ActionResult<{ householdId: string }>> => {
        try {
            // Auth and household access already verified by protectedHouseholdAction wrapper

            // Start transaction to ensure all related data is updated atomically
            await db.transaction(async tx => {
                // 1. Update the household basic information
                await tx
                    .update(households)
                    .set({
                        first_name: data.household.first_name,
                        last_name: data.household.last_name,
                        phone_number: data.household.phone_number,
                        locale: data.household.locale,
                        postal_code: normalizePostalCode(data.household.postal_code),
                    })
                    .where(eq(households.id, household.id));

                // 2. Handle household members - first delete existing members
                await tx
                    .delete(householdMembers)
                    .where(eq(householdMembers.household_id, household.id));

                // Then add updated members
                if (data.members && data.members.length > 0) {
                    await tx.insert(householdMembers).values(
                        data.members.map(member => ({
                            household_id: household.id,
                            age: member.age,
                            sex: member.sex as "male" | "female" | "other",
                        })),
                    );
                }

                // 3. Handle dietary restrictions - first delete existing restrictions
                await tx
                    .delete(householdDietaryRestrictions)
                    .where(eq(householdDietaryRestrictions.household_id, household.id));

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
                            household_id: household.id,
                            dietary_restriction_id: restriction.id,
                        })),
                    );
                }

                // 4. Handle pets - first delete existing pets
                await tx.delete(pets).where(eq(pets.household_id, household.id));

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
                                // Create the pet species without specifying id (let DB generate it)
                                const [newSpecies] = await tx
                                    .insert(petSpecies)
                                    .values({
                                        name: pet.speciesName,
                                    })
                                    .returning();

                                // Assign the generated id to pet.species
                                pet.species = newSpecies.id;
                            }
                        }
                    }

                    // Then add pets to the database
                    await tx.insert(pets).values(
                        data.pets.map(pet => ({
                            household_id: household.id,
                            pet_species_id: pet.species,
                        })),
                    );
                }

                // 5. Handle additional needs - first delete existing needs
                await tx
                    .delete(householdAdditionalNeeds)
                    .where(eq(householdAdditionalNeeds.household_id, household.id));

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
                            // Create without specifying id
                            const [newNeed] = await tx
                                .insert(additionalNeeds)
                                .values({
                                    need: need.need,
                                })
                                .returning();

                            // Use the generated id
                            need.id = newNeed.id;
                        }
                    }

                    // Then link needs to the household
                    await tx.insert(householdAdditionalNeeds).values(
                        data.additionalNeeds.map(need => ({
                            household_id: household.id,
                            additional_need_id: need.id,
                        })),
                    );
                }

                // 6. Handle food parcels using surgical operations with same-day matching
                // This preserves parcel IDs when only times change on the same day (Option B)
                const now = new Date();

                // Validate that NEW parcels are not in the past
                if (data.foodParcels.parcels && data.foodParcels.parcels.length > 0) {
                    const pastParcels = data.foodParcels.parcels.filter(
                        parcel => !parcel.id && new Date(parcel.pickupLatestTime) <= now,
                    );

                    if (pastParcels.length > 0) {
                        const { formatStockholmDate } = await import("@/app/utils/date-utils");
                        const dates = pastParcels
                            .map(p =>
                                formatStockholmDate(new Date(p.pickupEarliestTime), "yyyy-MM-dd"),
                            )
                            .join(", ");

                        return failure({
                            code: "PAST_PICKUP_TIME",
                            message: `Cannot create parcels with past pickup times for: ${dates}. Please select a future time or remove these dates.`,
                        });
                    }
                }

                // Get existing future parcels
                const existingFutureParcels = await tx
                    .select({
                        id: foodParcels.id,
                        locationId: foodParcels.pickup_location_id,
                        earliest: foodParcels.pickup_date_time_earliest,
                        latest: foodParcels.pickup_date_time_latest,
                    })
                    .from(foodParcels)
                    .where(
                        and(
                            eq(foodParcels.household_id, household.id),
                            eq(foodParcels.is_picked_up, false),
                            gt(foodParcels.pickup_date_time_earliest, now),
                            notDeleted(),
                        ),
                    );

                // Calculate surgical operations
                const desiredParcels = data.foodParcels.parcels || [];
                const operations = calculateParcelOperations(
                    existingFutureParcels,
                    desiredParcels,
                    data.foodParcels.pickupLocationId,
                    household.id,
                );

                // Execute CREATE operations
                if (operations.toCreate.length > 0) {
                    // Use centralized helper for proper conflict handling
                    const { insertParcels } = await import("@/app/db/insert-parcels");
                    await insertParcels(tx, operations.toCreate);
                }

                // Execute UPDATE operations (same-day time changes)
                for (const op of operations.toUpdate) {
                    await tx
                        .update(foodParcels)
                        .set({
                            pickup_date_time_earliest: op.pickup_date_time_earliest,
                            pickup_date_time_latest: op.pickup_date_time_latest,
                        })
                        .where(eq(foodParcels.id, op.id));
                }

                // Execute DELETE operations (soft delete with SMS cancellation handling)
                if (operations.toDelete.length > 0) {
                    // Import helper function for SMS-aware soft deletion
                    const { softDeleteParcelInTransaction } = await import(
                        "@/app/[locale]/parcels/actions"
                    );

                    for (const parcelId of operations.toDelete) {
                        await softDeleteParcelInTransaction(
                            tx,
                            parcelId,
                            session.user?.githubUsername || "system",
                        );
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
                                    household_id: household.id,
                                    comment: comment.comment.trim(),
                                    author_github_username:
                                        comment.author_github_username || "anonymous",
                                }),
                            ),
                        );
                    }
                }

                // Audit log with IDs only (no PII)
                logger.info(
                    {
                        householdId: household.id,
                        locationId: data.foodParcels?.pickupLocationId,
                        parcelsCreated: operations.toCreate.length,
                        parcelsUpdated: operations.toUpdate.length,
                        parcelsDeleted: operations.toDelete.length,
                    },
                    "Household updated",
                );
            });

            return success({ householdId: household.id });
        } catch (error: unknown) {
            logError("Error updating household", error, {
                action: "updateHousehold",
                householdId: household.id,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: error instanceof Error ? error.message : "Unknown error occurred",
            });
        }
    },
);

// After successful update, recompute outside-hours count for the affected location.
// Note: This is defined outside the transaction above to avoid circular imports during tx.
export async function recomputeOutsideHoursForLocation(locationId: string) {
    try {
        const { recomputeOutsideHoursCount } = await import("@/app/[locale]/schedule/actions");
        await recomputeOutsideHoursCount(locationId);
    } catch (e) {
        logError("Failed to recompute outside-hours count after household update", e, {
            action: "recomputeOutsideHoursForLocation",
            locationId,
        });
    }
}

// Add comment to a household (for edit page)
export const addComment = protectedHouseholdAction(
    async (
        session,
        household,
        commentText: string,
    ): Promise<
        ActionResult<{
            id: string;
            created_at: Date;
            household_id: string;
            author_github_username: string;
            comment: string;
            githubUserData: GithubUserData | null;
        }>
    > => {
        if (!commentText.trim()) {
            return failure({
                code: "VALIDATION_ERROR",
                message: "Comment text is required",
            });
        }

        try {
            // Auth and household access already verified by protectedHouseholdAction wrapper

            // Get the current user from the session (use GitHub username for DB records)
            const username = session.user?.githubUsername || "anonymous";

            // Insert the comment
            const [comment] = await db
                .insert(householdComments)
                .values({
                    household_id: household.id,
                    comment: commentText.trim(),
                    author_github_username: username,
                })
                .returning();

            // Fetch user data from database for the comment author
            let githubUserData: GithubUserData | null = null;
            if (username && username !== "anonymous") {
                const [user] = await db
                    .select({
                        display_name: users.display_name,
                        avatar_url: users.avatar_url,
                    })
                    .from(users)
                    .where(eq(users.github_username, username))
                    .limit(1);

                if (user && (user.display_name || user.avatar_url)) {
                    githubUserData = {
                        name: user.display_name,
                        avatar_url: user.avatar_url,
                    };
                }
            }

            // Return the comment with user data
            return success({
                ...comment,
                githubUserData,
            });
        } catch (error) {
            logError("Error adding comment", error, {
                action: "addComment",
                householdId: household.id,
                username: session.user?.githubUsername,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: "Failed to add comment",
            });
        }
    },
);
