import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { foodParcels, households, pickupLocations } from "@/app/db/schema";
import { eq, gt } from "drizzle-orm";

export async function GET() {
    try {
        // Authentication is now handled by middleware

        // Fetch upcoming food parcels with household and location info
        const upcomingParcels = await db
            .select({
                id: foodParcels.id,
                householdId: foodParcels.household_id,
                householdName: households.first_name,
                householdLastName: households.last_name,
                pickupLocationName: pickupLocations.name,
                pickupDateTimeEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateTimeLatest: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
            .where(gt(foodParcels.pickup_date_time_earliest, new Date()))
            .orderBy(foodParcels.pickup_date_time_earliest);

        // Transform to match the expected interface
        const transformedParcels = upcomingParcels.map(parcel => ({
            id: parcel.id,
            householdId: parcel.householdId,
            householdName: `${parcel.householdName} ${parcel.householdLastName}`,
            pickupDate: parcel.pickupDateTimeEarliest,
            pickupEarliestTime: parcel.pickupDateTimeEarliest,
            pickupLatestTime: parcel.pickupDateTimeLatest,
            isPickedUp: parcel.isPickedUp,
        }));

        return NextResponse.json(transformedParcels);
    } catch (error) {
        console.error("Error fetching upcoming parcels:", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
