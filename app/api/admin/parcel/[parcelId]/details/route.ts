import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import {
    foodParcels,
    households,
    pickupLocations,
    householdMembers,
    pets,
    petSpecies,
    householdComments,
    householdDietaryRestrictions,
    dietaryRestrictions,
    householdAdditionalNeeds,
    additionalNeeds,
} from "@/app/db/schema";
import { notDeleted } from "@/app/db/query-helpers";
import { eq, desc, and } from "drizzle-orm";
import { authenticateAdminRequest } from "@/app/utils/auth/api-auth";
import { fetchMultipleGithubUserData } from "@/app/[locale]/households/actions";

export interface ParcelDetails {
    parcel: {
        id: string;
        householdId: string;
        pickupLocationId: string;
        pickupLocationName: string;
        pickupLocationAddress: string;
        pickupDateTimeEarliest: string;
        pickupDateTimeLatest: string;
        isPickedUp: boolean;
        pickedUpAt: string | null;
        pickedUpBy: string | null;
    };
    household: {
        id: string;
        firstName: string;
        lastName: string;
        phoneNumber: string;
        locale: string;
        postalCode: string;
        createdAt: string;
        members: Array<{
            id: string;
            age: number;
            sex: string;
        }>;
        pets: Array<{
            id: string;
            species: string;
        }>;
        dietaryRestrictions: string[];
        additionalNeeds: string[];
    };
    comments: Array<{
        id: string;
        author: string;
        comment: string;
        createdAt: string;
    }>;
}

// GET /api/admin/parcel/[parcelId]/details - Get comprehensive parcel details
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ parcelId: string }> },
) {
    try {
        // Validate authentication
        const authResult = await authenticateAdminRequest();
        if (!authResult.success) {
            return authResult.response!;
        }

        const { parcelId } = await params;

        // Fetch parcel with household and pickup location info
        const parcelData = await db
            .select({
                parcelId: foodParcels.id,
                householdId: foodParcels.household_id,
                pickupLocationId: foodParcels.pickup_location_id,
                pickupLocationName: pickupLocations.name,
                pickupLocationAddress: pickupLocations.street_address,
                pickupDateTimeEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateTimeLatest: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
                pickedUpAt: foodParcels.picked_up_at,
                pickedUpBy: foodParcels.picked_up_by_user_id,
                householdFirstName: households.first_name,
                householdLastName: households.last_name,
                householdPhoneNumber: households.phone_number,
                householdLocale: households.locale,
                householdPostalCode: households.postal_code,
                householdCreatedAt: households.created_at,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
            .where(and(eq(foodParcels.id, parcelId), notDeleted()))
            .limit(1);

        if (parcelData.length === 0) {
            return NextResponse.json({ error: "Parcel not found" }, { status: 404 });
        }

        const parcel = parcelData[0];

        // Fetch household members
        const members = await db
            .select({
                id: householdMembers.id,
                age: householdMembers.age,
                sex: householdMembers.sex,
            })
            .from(householdMembers)
            .where(eq(householdMembers.household_id, parcel.householdId));

        // Fetch pets with species information
        const householdPets = await db
            .select({
                id: pets.id,
                species: petSpecies.name,
            })
            .from(pets)
            .innerJoin(petSpecies, eq(pets.pet_species_id, petSpecies.id))
            .where(eq(pets.household_id, parcel.householdId));

        // Fetch dietary restrictions
        const dietaryRestrictionsData = await db
            .select({
                name: dietaryRestrictions.name,
            })
            .from(householdDietaryRestrictions)
            .innerJoin(
                dietaryRestrictions,
                eq(householdDietaryRestrictions.dietary_restriction_id, dietaryRestrictions.id),
            )
            .where(eq(householdDietaryRestrictions.household_id, parcel.householdId));

        // Fetch additional needs
        const additionalNeedsData = await db
            .select({
                need: additionalNeeds.need,
            })
            .from(householdAdditionalNeeds)
            .innerJoin(
                additionalNeeds,
                eq(householdAdditionalNeeds.additional_need_id, additionalNeeds.id),
            )
            .where(eq(householdAdditionalNeeds.household_id, parcel.householdId));

        // Fetch comments (most recent first)
        const commentsResult = await db
            .select({
                id: householdComments.id,
                author: householdComments.author_github_username,
                comment: householdComments.comment,
                createdAt: householdComments.created_at,
            })
            .from(householdComments)
            .where(eq(householdComments.household_id, parcel.householdId))
            .orderBy(desc(householdComments.created_at));

        // Fetch GitHub user data for all comment authors in one batch
        const usernames = commentsResult.map(comment => comment.author).filter(Boolean);

        const githubUserDataMap = await fetchMultipleGithubUserData(usernames);

        // Attach GitHub user data to comments
        const comments = commentsResult.map(comment => ({
            id: comment.id,
            author: comment.author,
            comment: comment.comment,
            createdAt: comment.createdAt,
            githubUserData: comment.author ? githubUserDataMap[comment.author] || null : null,
        }));

        // Build response
        const response: ParcelDetails = {
            parcel: {
                id: parcel.parcelId,
                householdId: parcel.householdId,
                pickupLocationId: parcel.pickupLocationId,
                pickupLocationName: parcel.pickupLocationName,
                pickupLocationAddress: parcel.pickupLocationAddress,
                pickupDateTimeEarliest: parcel.pickupDateTimeEarliest.toISOString(),
                pickupDateTimeLatest: parcel.pickupDateTimeLatest.toISOString(),
                isPickedUp: parcel.isPickedUp,
                pickedUpAt: parcel.pickedUpAt?.toISOString() || null,
                pickedUpBy: parcel.pickedUpBy,
            },
            household: {
                id: parcel.householdId,
                firstName: parcel.householdFirstName,
                lastName: parcel.householdLastName,
                phoneNumber: parcel.householdPhoneNumber,
                locale: parcel.householdLocale,
                postalCode: parcel.householdPostalCode,
                createdAt: parcel.householdCreatedAt.toISOString(),
                members: members.map(member => ({
                    id: member.id,
                    age: member.age,
                    sex: member.sex,
                })),
                pets: householdPets.map(pet => ({
                    id: pet.id,
                    species: pet.species,
                })),
                dietaryRestrictions: dietaryRestrictionsData.map(dr => dr.name),
                additionalNeeds: additionalNeedsData.map(an => an.need),
            },
            comments: comments.map(comment => ({
                id: comment.id,
                author: comment.author,
                comment: comment.comment,
                createdAt: comment.createdAt.toISOString(),
            })),
        };

        return NextResponse.json(response);
    } catch (error) {
        console.error("Error fetching parcel details:", error);
        return NextResponse.json({ error: "Failed to fetch parcel details" }, { status: 500 });
    }
}
