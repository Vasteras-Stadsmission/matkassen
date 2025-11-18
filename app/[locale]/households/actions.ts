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
    users,
} from "@/app/db/schema";
import { asc, eq, and, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { Comment, GithubUserData } from "./enroll/types";
import { notDeleted, isDeleted } from "@/app/db/query-helpers";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";
import { logError } from "@/app/utils/logger";

// Function to get all households with their first and last food parcel dates
export async function getHouseholds() {
    try {
        // Get all households (excluding anonymized ones)
        const householdsData = await db
            .select()
            .from(households)
            .where(isNull(households.anonymized_at)); // Filter out anonymized households

        // For each household, get the food parcels
        const householdsWithParcels = await Promise.all(
            householdsData.map(async household => {
                // Get all food parcels for this household sorted by pickup date
                const householdParcels = await db
                    .select()
                    .from(foodParcels)
                    .where(and(eq(foodParcels.household_id, household.id), notDeleted()))
                    .orderBy(foodParcels.pickup_date_time_latest);

                // Get the first and last food parcel dates (if any parcels exist)
                const firstParcel = householdParcels[0] ? householdParcels[0] : null;
                const lastParcel =
                    householdParcels.length > 0 ? householdParcels[householdParcels.length - 1] : null;

                // Get the next upcoming food parcel (based on latest pickup time)
                const now = new Date();
                const upcomingParcels = householdParcels.filter(
                    parcel => new Date(parcel.pickup_date_time_latest) > now,
                );
                const nextParcel = upcomingParcels.length > 0 ? upcomingParcels[0] : null;

                return {
                    ...household,
                    firstParcelDate: firstParcel ? firstParcel.pickup_date_time_latest : null,
                    lastParcelDate: lastParcel ? lastParcel.pickup_date_time_latest : null,
                    nextParcelDate: nextParcel ? nextParcel.pickup_date_time_latest : null,
                    nextParcelEarliestTime: nextParcel ? nextParcel.pickup_date_time_earliest : null,
                };
            }),
        );

        return householdsWithParcels;
    } catch (error) {
        logError("Error fetching households", error, {
            action: "getHouseholds",
        });
        throw error;
    }
}

// Enhanced function to get household details with GitHub data
export async function getHouseholdDetails(householdId: string) {
    try {
        // Get household basic info
        const [household] = await db
            .select({
                id: households.id,
                first_name: households.first_name,
                last_name: households.last_name,
                phone_number: households.phone_number,
                locale: households.locale,
                postal_code: households.postal_code,
                created_by: households.created_by,
                anonymized_at: households.anonymized_at,
                anonymized_by: households.anonymized_by,
            })
            .from(households)
            .where(eq(households.id, householdId))
            .limit(1);

        if (!household) {
            return null;
        }

        // Get household members
        const members = await db
            .select({
                id: householdMembers.id,
                age: householdMembers.age,
                sex: householdMembers.sex,
            })
            .from(householdMembers)
            .where(eq(householdMembers.household_id, householdId));

        // Get household dietary restrictions
        const dietaryRestrictionsResult = await db
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

        // Get household additional needs
        const additionalNeedsResult = await db
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

        // Get household pets with species info
        const householdPets = await db
            .select({
                id: pets.id,
                species: petSpecies.id,
                speciesName: petSpecies.name,
            })
            .from(pets)
            .innerJoin(petSpecies, eq(pets.pet_species_id, petSpecies.id))
            .where(eq(pets.household_id, householdId));

        // Get active food parcels
        const foodParcelsResult = await db
            .select({
                id: foodParcels.id,
                pickup_location_id: foodParcels.pickup_location_id,
                pickup_date_time_earliest: foodParcels.pickup_date_time_earliest,
                pickup_date_time_latest: foodParcels.pickup_date_time_latest,
                is_picked_up: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, householdId), notDeleted()))
            .orderBy(asc(foodParcels.pickup_date_time_earliest));

        // Get deleted/cancelled food parcels
        const deletedParcelsResult = await db
            .select({
                id: foodParcels.id,
                pickup_location_id: foodParcels.pickup_location_id,
                pickup_date_time_earliest: foodParcels.pickup_date_time_earliest,
                pickup_date_time_latest: foodParcels.pickup_date_time_latest,
                is_picked_up: foodParcels.is_picked_up,
                deleted_at: foodParcels.deleted_at,
                deleted_by_user_id: foodParcels.deleted_by_user_id,
            })
            .from(foodParcels)
            .where(and(eq(foodParcels.household_id, householdId), isDeleted()))
            .orderBy(asc(foodParcels.deleted_at));

        // Get pickup location info
        let pickupLocation = null;
        if (foodParcelsResult.length > 0) {
            const locationId = foodParcelsResult[0].pickup_location_id;
            [pickupLocation] = await db
                .select({
                    id: pickupLocations.id,
                    name: pickupLocations.name,
                    address: pickupLocations.street_address,
                })
                .from(pickupLocations)
                .where(eq(pickupLocations.id, locationId))
                .limit(1);
        }

        // Get comments with author info from users table
        const commentsResult = await db
            .select({
                id: householdComments.id,
                created_at: householdComments.created_at,
                author_github_username: householdComments.author_github_username,
                comment: householdComments.comment,
                author_display_name: users.display_name,
                author_avatar_url: users.avatar_url,
            })
            .from(householdComments)
            .leftJoin(users, eq(householdComments.author_github_username, users.github_username))
            .where(eq(householdComments.household_id, householdId))
            .orderBy(asc(householdComments.created_at));

        // Map comments with user data from DB
        const comments = commentsResult.map(comment => ({
            id: comment.id,
            created_at: comment.created_at,
            author_github_username: comment.author_github_username,
            comment: comment.comment,
            githubUserData:
                comment.author_display_name || comment.author_avatar_url
                    ? {
                          name: comment.author_display_name || null,
                          avatar_url: comment.author_avatar_url || null,
                      }
                    : null,
        }));

        // Fetch creator data from users table (if known)
        let creatorGithubData: GithubUserData | null = null;
        if (household.created_by) {
            const [creator] = await db
                .select({
                    display_name: users.display_name,
                    avatar_url: users.avatar_url,
                })
                .from(users)
                .where(eq(users.github_username, household.created_by))
                .limit(1);

            if (creator && (creator.display_name || creator.avatar_url)) {
                creatorGithubData = {
                    name: creator.display_name || null,
                    avatar_url: creator.avatar_url || null,
                };
            }
        }

        return {
            household,
            creatorGithubData,
            members,
            dietaryRestrictions: dietaryRestrictionsResult,
            additionalNeeds: additionalNeedsResult,
            pets: householdPets,
            foodParcels: {
                pickupLocationId: pickupLocation?.id || "",
                parcels: foodParcelsResult.map(parcel => ({
                    id: parcel.id,
                    pickupDate: parcel.pickup_date_time_earliest,
                    pickupEarliestTime: parcel.pickup_date_time_earliest,
                    pickupLatestTime: parcel.pickup_date_time_latest,
                    isPickedUp: parcel.is_picked_up,
                })),
            },
            deletedParcels: deletedParcelsResult.map(parcel => ({
                id: parcel.id,
                pickupDate: parcel.pickup_date_time_earliest,
                pickupEarliestTime: parcel.pickup_date_time_earliest,
                pickupLatestTime: parcel.pickup_date_time_latest,
                isPickedUp: parcel.is_picked_up,
                deletedAt: parcel.deleted_at,
                deletedBy: parcel.deleted_by_user_id,
            })),
            pickupLocation,
            comments,
        };
    } catch (error) {
        logError("Error fetching household details", error, {
            action: "getHouseholdDetails",
            householdId,
        });
        return null;
    }
}

// Function to add a comment to a household
export async function addHouseholdComment(
    householdId: string,
    comment: string,
): Promise<Comment | null> {
    if (!comment.trim()) {
        return null;
    }

    try {
        // Authorization: Verify user is authenticated and is an org member
        const { validateOrganizationMembership } = await import(
            "@/app/utils/auth/organization-auth"
        );

        // Get the current user from the session
        const session = await auth();
        // Get the GitHub username from the githubUsername field (login, not display name)
        const githubUsername = session?.user?.githubUsername || "anonymous";

        // Check organization membership
        if (githubUsername !== "anonymous") {
            const orgCheck = await validateOrganizationMembership(githubUsername, "server-action");
            if (!orgCheck.isValid) {
                logError(
                    "Unauthorized comment attempt",
                    new Error(orgCheck.error || "Unknown error"),
                    {
                        action: "addHouseholdComment",
                        githubUsername,
                        householdId,
                    },
                );
                return null;
            }
        }

        // Insert the comment with the github username
        const [dbComment] = await db
            .insert(householdComments)
            .values({
                household_id: householdId,
                comment: comment.trim(),
                author_github_username: githubUsername,
            })
            .returning();

        // Create a properly typed Comment object
        const newComment: Comment = {
            id: dbComment.id,
            created_at: dbComment.created_at,
            author_github_username: dbComment.author_github_username,
            comment: dbComment.comment,
        };

        // Fetch user data from database for the new comment
        if (githubUsername && githubUsername !== "anonymous") {
            const [user] = await db
                .select({
                    display_name: users.display_name,
                    avatar_url: users.avatar_url,
                })
                .from(users)
                .where(eq(users.github_username, githubUsername))
                .limit(1);

            if (user && (user.display_name || user.avatar_url)) {
                newComment.githubUserData = {
                    name: user.display_name || null,
                    avatar_url: user.avatar_url || null,
                };
            }
        }

        return newComment;
    } catch (error) {
        logError("Error adding household comment", error, {
            action: "addHouseholdComment",
            householdId,
        });
        return null;
    }
}

// Function to delete a comment
export const deleteHouseholdComment = protectedAction(
    async (session, commentId: string): Promise<ActionResult<boolean>> => {
        try {
            // Auth already verified by protectedAction wrapper
            // Delete the comment with the given ID
            const result = await db
                .delete(householdComments)
                .where(eq(householdComments.id, commentId))
                .returning({ id: householdComments.id });

            // Return true if a comment was deleted, false otherwise
            return success(result.length > 0);
        } catch (error) {
            logError("Error deleting household comment", error, {
                action: "deleteHouseholdComment",
                commentId,
            });
            return failure({
                code: "DATABASE_ERROR",
                message: "Failed to delete comment",
            });
        }
    },
);
