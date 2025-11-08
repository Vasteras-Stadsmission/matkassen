import { NextResponse } from "next/server";
import { db } from "@/app/db/drizzle";
import { handoutLocations } from "@/app/db/schema";
import { logError } from "@/app/utils/logger";

export async function GET() {
    try {
        const locations = await db
            .select({
                id: handoutLocations.id,
                name: handoutLocations.name,
                maxParcelsPerDay: handoutLocations.parcels_max_per_day,
                streetAddress: handoutLocations.street_address,
            })
            .from(handoutLocations);

        return NextResponse.json(locations);
    } catch (error) {
        logError("Error fetching handout locations", error, {
            method: "GET",
            path: "/api/handout-locations",
        });
        return NextResponse.json({ error: "Failed to fetch handout locations" }, { status: 500 });
    }
}
