import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { pickupLocations } from "@/app/db/schema";
import { logError } from "@/app/utils/logger";

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
        logError("Error fetching handout locations", error, {
            method: "GET",
            path: "/api/handout-locations",
        });
        return NextResponse.json({ error: "Failed to fetch handout locations" }, { status: 500 });
    }
}
