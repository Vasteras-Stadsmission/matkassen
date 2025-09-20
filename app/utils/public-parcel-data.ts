/**
 * Data fetching utilities for public parcel pages
 */

import { db } from "@/app/db/drizzle";
import { foodParcels, households, pickupLocations } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { Time } from "@/app/utils/time-provider";

export interface PublicParcelData {
    id: string;
    householdName: string;
    householdLocale: string;
    pickupDateTimeEarliest: Date;
    pickupDateTimeLatest: Date;
    isPickedUp: boolean;
    pickedUpAt?: Date;
    locationName: string;
    locationAddress: string;
    locationPostalCode: string;
}

export type ParcelStatus = "scheduled" | "ready" | "collected" | "expired";

/**
 * Get public parcel data by ID
 */
export async function getPublicParcelData(parcelId: string): Promise<PublicParcelData | null> {
    try {
        const result = await db
            .select({
                id: foodParcels.id,
                householdName: {
                    first: households.first_name,
                    last: households.last_name,
                },
                householdLocale: households.locale,
                pickupDateTimeEarliest: foodParcels.pickup_date_time_earliest,
                pickupDateTimeLatest: foodParcels.pickup_date_time_latest,
                isPickedUp: foodParcels.is_picked_up,
                pickedUpAt: foodParcels.picked_up_at,
                locationName: pickupLocations.name,
                locationAddress: pickupLocations.street_address,
                locationPostalCode: pickupLocations.postal_code,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(pickupLocations, eq(foodParcels.pickup_location_id, pickupLocations.id))
            .where(eq(foodParcels.id, parcelId))
            .limit(1);

        if (result.length === 0) {
            return null;
        }

        const data = result[0];

        return {
            id: data.id,
            householdName: `${data.householdName.first} ${data.householdName.last}`,
            householdLocale: data.householdLocale,
            pickupDateTimeEarliest: data.pickupDateTimeEarliest,
            pickupDateTimeLatest: data.pickupDateTimeLatest,
            isPickedUp: data.isPickedUp,
            pickedUpAt: data.pickedUpAt || undefined,
            locationName: data.locationName,
            locationAddress: data.locationAddress,
            locationPostalCode: data.locationPostalCode,
        };
    } catch (error) {
        console.error("Error fetching public parcel data:", error);
        return null;
    }
}

/**
 * Determine parcel status based on current time and pickup window
 */
export function getParcelStatus(parcel: PublicParcelData): ParcelStatus {
    if (parcel.isPickedUp) {
        return "collected";
    }

    const now = Time.now().toDate();
    const earliestTime = new Date(parcel.pickupDateTimeEarliest);
    const latestTime = new Date(parcel.pickupDateTimeLatest);

    // Check if expired (7 days after latest pickup time)
    const expiryTime = new Date(latestTime);
    expiryTime.setDate(expiryTime.getDate() + 7);

    if (now > expiryTime) {
        return "expired";
    }

    // Check if within pickup window
    if (now >= earliestTime && now <= latestTime) {
        return "ready";
    }

    // Before pickup window or after but not expired
    return "scheduled";
}

/**
 * Generate Maps URLs for directions
 */
export function generateMapsUrls(locationName: string, address: string, postalCode: string) {
    const query = encodeURIComponent(`${locationName}, ${address}, ${postalCode}`);

    return {
        google: `https://www.google.com/maps/search/?api=1&query=${query}`,
        apple: `https://maps.apple.com/?q=${query}`,
    };
}

/**
 * Generate admin URL for QR code
 */
export function generateAdminUrl(parcelId: string): string {
    const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.NODE_ENV === "production" ? "https://matkassen.org" : "http://localhost:3000");
    return `${baseUrl}/sv/schedule?parcel=${parcelId}`; // Use Swedish locale as default for admin
}
