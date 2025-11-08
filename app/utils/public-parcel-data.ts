/**
 * Data fetching utilities for public parcel pages
 */

import { db } from "@/app/db/drizzle";
import { foodParcels, households, handoutLocations } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { Time } from "@/app/utils/time-provider";
import { generateUrl } from "@/app/config/branding";
import { logError } from "@/app/utils/logger";

export interface PublicParcelData {
    id: string;
    householdName: string;
    householdLocale: string;
    handoutDateTimeEarliest: Date;
    handoutDateTimeLatest: Date;
    isHandedOut: boolean;
    handedOutAt?: Date;
    locationName: string;
    locationAddress: string;
    locationPostalCode: string;
    deletedAt?: Date | null;
}

export type ParcelStatus = "scheduled" | "ready" | "collected" | "expired" | "cancelled";

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
                handoutDateTimeEarliest: foodParcels.handout_date_time_earliest,
                handoutDateTimeLatest: foodParcels.handout_date_time_latest,
                isHandedOut: foodParcels.is_handed_out,
                handedOutAt: foodParcels.handed_out_at,
                locationName: handoutLocations.name,
                locationAddress: handoutLocations.street_address,
                locationPostalCode: handoutLocations.postal_code,
                deletedAt: foodParcels.deleted_at,
            })
            .from(foodParcels)
            .innerJoin(households, eq(foodParcels.household_id, households.id))
            .innerJoin(handoutLocations, eq(foodParcels.handout_location_id, handoutLocations.id))
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
            handoutDateTimeEarliest: data.handoutDateTimeEarliest,
            handoutDateTimeLatest: data.handoutDateTimeLatest,
            isHandedOut: data.isHandedOut,
            handedOutAt: data.handedOutAt || undefined,
            locationName: data.locationName,
            locationAddress: data.locationAddress,
            locationPostalCode: data.locationPostalCode,
            deletedAt: data.deletedAt || null,
        };
    } catch (error) {
        logError("Error fetching public parcel data", error);
        return null;
    }
}

/**
 * Determine parcel status based on current time and handout window
 */
export function getParcelStatus(parcel: PublicParcelData): ParcelStatus {
    // Check if cancelled (soft deleted)
    if (parcel.deletedAt) {
        return "cancelled";
    }

    if (parcel.isHandedOut) {
        return "collected";
    }

    const now = Time.now().toDate();
    const earliestTime = new Date(parcel.handoutDateTimeEarliest);
    const latestTime = new Date(parcel.handoutDateTimeLatest);

    // Check if expired (7 days after latest handout time)
    const expiryTime = new Date(latestTime);
    expiryTime.setDate(expiryTime.getDate() + 7);

    if (now > expiryTime) {
        return "expired";
    }

    // Check if within handout window
    if (now >= earliestTime && now <= latestTime) {
        return "ready";
    }

    // Before handout window or after but not expired
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
    return generateUrl(`/schedule?parcel=${parcelId}`); // Locale-agnostic, middleware will handle locale detection
}
