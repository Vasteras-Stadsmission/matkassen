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
import { eq, and, gt, ne, isNull, inArray } from "drizzle-orm";
import { FormData, GithubUserData } from "../../enroll/types";
import {
    protectedAgreementHouseholdAction,
    protectedAgreementAction,
} from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { type AuthSession } from "@/app/utils/auth/server-action-auth";
import { notDeleted } from "@/app/db/query-helpers";
import { calculateParcelOperations } from "./calculateParcelOperations";
import { logger, logError } from "@/app/utils/logger";
import { normalizePhoneToE164, validatePhoneInput } from "@/app/utils/validation/phone-validation";
import { OptionNotAvailableError, ensurePickupLocationExists } from "@/app/db/validation-helpers";

export interface HouseholdUpdateResult {
    success: boolean;
    householdId?: string;
    error?: string;
}

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function dedupeIds(ids: string[]): string[] {
    return [...new Set(ids.filter(Boolean))];
}

async function ensureSelectableDietaryRestrictions(
    tx: DbTransaction,
    householdId: string,
    selectedRestrictions: FormData["dietaryRestrictions"],
) {
    const selectedIds = dedupeIds(selectedRestrictions.map(restriction => restriction.id));
    if (selectedIds.length === 0) return;

    const existingLinks = await tx
        .select({ id: householdDietaryRestrictions.dietary_restriction_id })
        .from(householdDietaryRestrictions)
        .where(eq(householdDietaryRestrictions.household_id, householdId));
    const existingIds = new Set(existingLinks.map(link => link.id));

    const options = await tx
        .select({ id: dietaryRestrictions.id, isActive: dietaryRestrictions.is_active })
        .from(dietaryRestrictions)
        .where(inArray(dietaryRestrictions.id, selectedIds));

    const optionById = new Map(options.map(option => [option.id, option]));
    const invalid = selectedRestrictions.find(restriction => {
        const option = optionById.get(restriction.id);
        if (!option) return true;
        return !option.isActive && !existingIds.has(restriction.id);
    });

    if (invalid) {
        throw new OptionNotAvailableError();
    }
}

async function ensureSelectablePetSpecies(
    tx: DbTransaction,
    householdId: string,
    selectedPets: FormData["pets"],
) {
    const selectedSpeciesIds = dedupeIds(selectedPets.map(pet => pet.species));
    if (selectedSpeciesIds.length === 0) return;

    const existingSpecies = await tx
        .select({ id: pets.pet_species_id })
        .from(pets)
        .where(eq(pets.household_id, householdId));
    const existingIds = new Set(existingSpecies.map(pet => pet.id));

    const options = await tx
        .select({ id: petSpecies.id, isActive: petSpecies.is_active })
        .from(petSpecies)
        .where(inArray(petSpecies.id, selectedSpeciesIds));

    const optionById = new Map(options.map(option => [option.id, option]));
    const invalid = selectedPets.find(pet => {
        const option = optionById.get(pet.species);
        if (!option) return true;
        return !option.isActive && !existingIds.has(pet.species);
    });

    if (invalid) {
        throw new OptionNotAvailableError();
    }
}

async function ensureSelectableAdditionalNeeds(
    tx: DbTransaction,
    householdId: string,
    selectedNeeds: FormData["additionalNeeds"],
) {
    const selectedIds = dedupeIds(selectedNeeds.map(need => need.id));
    if (selectedIds.length === 0) return;

    const existingLinks = await tx
        .select({ id: householdAdditionalNeeds.additional_need_id })
        .from(householdAdditionalNeeds)
        .where(eq(householdAdditionalNeeds.household_id, householdId));
    const existingIds = new Set(existingLinks.map(link => link.id));

    const options = await tx
        .select({ id: additionalNeeds.id, isActive: additionalNeeds.is_active })
        .from(additionalNeeds)
        .where(inArray(additionalNeeds.id, selectedIds));

    const optionById = new Map(options.map(option => [option.id, option]));
    const invalid = selectedNeeds.find(need => {
        const option = optionById.get(need.id);
        if (!option) return true;
        return !option.isActive && !existingIds.has(need.id);
    });

    if (invalid) {
        throw new OptionNotAvailableError();
    }
}

// Function to format household details from DB format to form format for editing
export const getHouseholdFormData = protectedAgreementAction(
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
            color: dietaryRestrictions.color,
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
            color: additionalNeeds.color,
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
            // SMS consent defaults to true in edit mode since consent was required at enrollment.
            // Re-consent is only required if the phone number changes (handled by wizard validation).
            sms_consent: true,
            primary_pickup_location_id: household.primary_pickup_location_id,
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
export const updateHousehold = protectedAgreementHouseholdAction(
    async (session, household, data: FormData): Promise<ActionResult<{ householdId: string }>> => {
        try {
            // Auth and household access already verified by protectedHouseholdAction wrapper

            // Server-side validation - don't trust client input
            const phoneError = validatePhoneInput(data.household.phone_number);
            if (phoneError) {
                return failure({
                    code: "VALIDATION_ERROR",
                    message: phoneError, // Translation key e.g. "validation.phoneNumberFormat"
                });
            }

            // Check if phone number changed and validate no duplicates
            const newPhoneE164 = normalizePhoneToE164(data.household.phone_number);

            // Fetch current phone number to detect changes (HouseholdData doesn't include it)
            const [currentHousehold] = await db
                .select({ phone_number: households.phone_number })
                .from(households)
                .where(eq(households.id, household.id))
                .limit(1);
            const phoneChanged = currentHousehold?.phone_number !== newPhoneE164;

            if (phoneChanged) {
                // Check for duplicate phone numbers (exclude current household and anonymized)
                const existingWithPhone = await db
                    .select({ id: households.id })
                    .from(households)
                    .where(
                        and(
                            eq(households.phone_number, newPhoneE164),
                            ne(households.id, household.id),
                            isNull(households.anonymized_at),
                        ),
                    )
                    .limit(1);

                if (existingWithPhone.length > 0) {
                    return failure({
                        code: "DUPLICATE_PHONE",
                        message: "validation.phoneNumberInUse",
                    });
                }
            }

            // Normalize empty string to null (Mantine Select uses "" for no selection)
            const primaryLocationId = data.household.primary_pickup_location_id || null;

            // Start transaction to ensure all related data is updated atomically
            await db.transaction(async tx => {
                // 0. Validate primary pickup location exists (if provided)
                if (primaryLocationId) {
                    await ensurePickupLocationExists(tx, primaryLocationId);
                }

                // 1. Update the household basic information
                await tx
                    .update(households)
                    .set({
                        first_name: data.household.first_name,
                        last_name: data.household.last_name,
                        phone_number: newPhoneE164,
                        locale: data.household.locale,
                        primary_pickup_location_id: primaryLocationId,
                    })
                    .where(eq(households.id, household.id));

                // Note: We don't update pending SMS phone numbers here.
                // JIT re-rendering at send time ensures fresh phone numbers are used.

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
                await ensureSelectableDietaryRestrictions(
                    tx,
                    household.id,
                    data.dietaryRestrictions,
                );

                await tx
                    .delete(householdDietaryRestrictions)
                    .where(eq(householdDietaryRestrictions.household_id, household.id));

                // Then add updated restrictions
                if (data.dietaryRestrictions && data.dietaryRestrictions.length > 0) {
                    // Then link restrictions to the household
                    await tx.insert(householdDietaryRestrictions).values(
                        dedupeIds(data.dietaryRestrictions.map(restriction => restriction.id)).map(
                            restrictionId => ({
                                household_id: household.id,
                                dietary_restriction_id: restrictionId,
                            }),
                        ),
                    );
                }

                // 4. Handle pets - first delete existing pets
                await ensureSelectablePetSpecies(tx, household.id, data.pets);

                await tx.delete(pets).where(eq(pets.household_id, household.id));

                // Then add updated pets
                if (data.pets && data.pets.length > 0) {
                    // Then add pets to the database
                    await tx.insert(pets).values(
                        data.pets.map(pet => ({
                            household_id: household.id,
                            pet_species_id: pet.species,
                        })),
                    );
                }

                // 5. Handle additional needs - first delete existing needs
                await ensureSelectableAdditionalNeeds(tx, household.id, data.additionalNeeds);

                await tx
                    .delete(householdAdditionalNeeds)
                    .where(eq(householdAdditionalNeeds.household_id, household.id));

                // Then add updated needs
                if (data.additionalNeeds && data.additionalNeeds.length > 0) {
                    // Then link needs to the household
                    await tx.insert(householdAdditionalNeeds).values(
                        dedupeIds(data.additionalNeeds.map(need => need.id)).map(needId => ({
                            household_id: household.id,
                            additional_need_id: needId,
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
                    const { softDeleteParcelInTransaction } =
                        await import("@/app/[locale]/parcels/actions");

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
            if (error instanceof OptionNotAvailableError) {
                return failure({
                    code: error.code,
                    message: error.message,
                });
            }

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
export const addComment = protectedAgreementHouseholdAction(
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
