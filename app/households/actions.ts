"use server";

import { db } from "../db/drizzle";
import {
    households,
    householdMembers,
    dietaryRestrictions,
    additionalNeeds,
    petSpecies,
    pets,
    foodParcels,
    pickupLocations,
    householdDietaryRestrictions,
    householdAdditionalNeeds,
} from "../db/schema";
import { eq } from "drizzle-orm";

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

// Function to get detailed information about a specific household
export async function getHouseholdDetails(householdId: string) {
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

    // Get food parcels with pickup location
    const foodParcelsData = await db
        .select({
            id: foodParcels.id,
            pickupLocationId: foodParcels.pickup_location_id,
            pickupDate: foodParcels.pickup_date_time_earliest,
            pickupEarliestTime: foodParcels.pickup_date_time_earliest,
            pickupLatestTime: foodParcels.pickup_date_time_latest,
            isPickedUp: foodParcels.is_picked_up,
            locationName: pickupLocations.name,
            locationAddress: pickupLocations.street_address,
        })
        .from(foodParcels)
        .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
        .where(eq(foodParcels.household_id, householdId))
        .orderBy(foodParcels.pickup_date_time_latest);

    // Prepare food parcels structure in the format expected by the UI
    const parcels = foodParcelsData.map(parcel => ({
        id: parcel.id,
        pickupDate: parcel.pickupDate,
        pickupEarliestTime: parcel.pickupEarliestTime,
        pickupLatestTime: parcel.pickupLatestTime,
        isPickedUp: parcel.isPickedUp,
    }));

    // Group by weekday to match the format expected by ReviewForm
    const foodParcelsFormatted = {
        pickupLocationId: foodParcelsData.length > 0 ? foodParcelsData[0].pickupLocationId : "",
        totalCount: parcels.length,
        // These fields aren't used in the detail view but included for structure compatibility
        weekday: "",
        repeatValue: "",
        startDate: new Date(),
        parcels: parcels,
    };

    // Return complete household details in a format that matches ReviewForm expectations
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
        dietaryRestrictions: dietaryRestrictionsData.map(restriction => ({
            id: restriction.id,
            name: restriction.name,
        })),
        additionalNeeds: additionalNeedsData.map(need => ({
            id: need.id,
            need: need.need,
        })),
        pets: petsData.map(pet => ({
            id: pet.id,
            species: pet.species,
            speciesName: pet.speciesName,
        })),
        foodParcels: foodParcelsFormatted,
        pickupLocation:
            foodParcelsData.length > 0
                ? {
                      id: foodParcelsData[0].pickupLocationId,
                      name: foodParcelsData[0].locationName,
                      address: foodParcelsData[0].locationAddress,
                  }
                : null,
    };
}
