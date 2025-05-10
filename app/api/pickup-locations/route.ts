import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { pickupLocations } from "@/app/db/schema";

export async function GET() {
    try {
        const locations = await db
            .select({
                id: pickupLocations.id,
                name: pickupLocations.name,
                maxParcelsPerDay: pickupLocations.parcels_max_per_day,
                streetAddress: pickupLocations.street_address,
            })
            .from(pickupLocations);

        return NextResponse.json(locations);
    } catch (error) {
        console.error("Error fetching pickup locations:", error);
        return NextResponse.json({ error: "Failed to fetch pickup locations" }, { status: 500 });
    }
}
