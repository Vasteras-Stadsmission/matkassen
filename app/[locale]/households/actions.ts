"use server";

import { cache } from "react";
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
import { asc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { Comment, GithubUserData } from "./enroll/types";
import { protectedAction } from "@/app/utils/auth/protected-action";
import { success, failure, type ActionResult } from "@/app/utils/auth/action-result";

// Cache GitHub user data fetching
export const fetchGithubUserData = cache(
    async (username: string): Promise<GithubUserData | null> => {
        if (!username) return null;

        try {
            const response = await fetch(`https://api.github.com/users/${username}`, {
                headers: {
                    // Add auth token if available
                    ...(process.env.GITHUB_TOKEN
                        ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
                        : {}),
                },
                // Cache response for 24 hours
                next: { revalidate: 86400 },
            });

            if (response.ok) {
                const userData = await response.json();
                return {
                    avatar_url: userData.avatar_url,
                    name: userData.name,
                };
            }
            return null;
        } catch (error) {
            console.error(`Error fetching GitHub user: ${username}`, error);
            return null;
        }
    },
);

// Fetch GitHub user data for multiple usernames at once
export async function fetchMultipleGithubUserData(usernames: string[]) {
    if (!usernames || usernames.length === 0) return {};

    const uniqueUsernames = [...new Set(usernames.filter(Boolean))];
    const userDataEntries = await Promise.all(
        uniqueUsernames.map(async username => [username, await fetchGithubUserData(username)]),
    );

    // Build a map of username -> user data
    return Object.fromEntries(userDataEntries.filter(([, data]) => data !== null));
}

// Function to get all households with their first and last food parcel dates
export async function getHouseholds() {
    // Get all households
    const householdsData = await db.select().from(households);

    // For each household, get the food parcels
    const householdsWithParcels = await Promise.all(
        householdsData.map(async household => {
            // Get all food parcels for this household sorted by pickup date
            const householdParcels = await db
                .select()
                .from(foodParcels)
                .where(eq(foodParcels.household_id, household.id))
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

        // Get food parcels
        const foodParcelsResult = await db
            .select({
                id: foodParcels.id,
                pickup_location_id: foodParcels.pickup_location_id,
                pickup_date_time_earliest: foodParcels.pickup_date_time_earliest,
                pickup_date_time_latest: foodParcels.pickup_date_time_latest,
                is_picked_up: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .where(eq(foodParcels.household_id, householdId))
            .orderBy(asc(foodParcels.pickup_date_time_earliest));

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

        // Get comments
        const commentsResult = await db
            .select({
                id: householdComments.id,
                created_at: householdComments.created_at,
                author_github_username: householdComments.author_github_username,
                comment: householdComments.comment,
            })
            .from(householdComments)
            .where(eq(householdComments.household_id, householdId))
            .orderBy(asc(householdComments.created_at));

        // Fetch GitHub user data for all comments in one batch
        const usernames = commentsResult
            .map(comment => comment.author_github_username)
            .filter(Boolean);

        const githubUserDataMap = await fetchMultipleGithubUserData(usernames);

        // Attach GitHub user data to comments
        const comments = commentsResult.map(comment => {
            const githubUserData = comment.author_github_username
                ? githubUserDataMap[comment.author_github_username] || null
                : null;

            return {
                ...comment,
                githubUserData,
            };
        });

        return {
            household,
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
            pickupLocation,
            comments,
        };
    } catch (error) {
        console.error("Error fetching household details:", error);
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
        // Get the GitHub username from the name field, which contains the GitHub username
        const githubUsername = session?.user?.name || "anonymous";

        // Check organization membership
        if (githubUsername !== "anonymous") {
            const orgCheck = await validateOrganizationMembership(githubUsername, "server-action");
            if (!orgCheck.isValid) {
                console.error(
                    `Unauthorized comment attempt by ${githubUsername}: ${orgCheck.error}`,
                );
                return null;
            }
        }

        // Log the action for audit trail
        console.log(`[AUDIT] User ${githubUsername} adding comment to household ${householdId}`);

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

        // Fetch GitHub user data for the new comment
        if (githubUsername && githubUsername !== "anonymous") {
            const githubUserData = await fetchGithubUserData(githubUsername);
            if (githubUserData) {
                newComment.githubUserData = githubUserData;
            }
        }

        return newComment;
    } catch (error) {
        console.error("Error adding household comment:", error);
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
            console.error("Error deleting household comment:", error);
            return failure({
                code: "DATABASE_ERROR",
                message: "Failed to delete comment",
            });
        }
    },
);
