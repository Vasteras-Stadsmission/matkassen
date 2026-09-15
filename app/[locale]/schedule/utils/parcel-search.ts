import { normalizePersonNameForComparison } from "@/app/utils/person-name";
import type { FoodParcel, ParcelDisplayStatus } from "../types";

const TODAY_STATUS_ORDER: Record<ParcelDisplayStatus, number> = {
    upcoming: 0,
    notPickedUp: 1,
    noShow: 1,
    cancelled: 1,
    pickedUp: 2,
};

/**
 * Orders today's handout list as a lightweight work queue.
 *
 * Active parcels come first, followed by no-shows and picked-up parcels. Pickup time only
 * affects the order when the list actually contains more than one start time; otherwise the
 * displayed household name determines the order directly.
 */
export function sortTodaysParcels<T extends FoodParcel & { status: ParcelDisplayStatus }>(
    parcels: T[],
): T[] {
    const hasMultiplePickupTimes =
        new Set(parcels.map(parcel => new Date(parcel.pickupEarliestTime).getTime())).size > 1;

    return [...parcels].sort((a, b) => {
        const statusDifference = TODAY_STATUS_ORDER[a.status] - TODAY_STATUS_ORDER[b.status];
        if (statusDifference !== 0) return statusDifference;

        if (hasMultiplePickupTimes) {
            const timeDifference =
                new Date(a.pickupEarliestTime).getTime() - new Date(b.pickupEarliestTime).getTime();
            if (timeDifference !== 0) return timeDifference;
        }

        return normalizePersonNameForComparison(a.householdName).localeCompare(
            normalizePersonNameForComparison(b.householdName),
            "sv",
        );
    });
}

/**
 * Filters parcels by a search query matching household name or phone number.
 *
 * Phone matching supports both E.164 (+46701234567) and Swedish local format (0701234567).
 * Partial matches work from any digit position.
 */
export function filterParcelsByQuery<T extends FoodParcel>(parcels: T[], searchQuery: string): T[] {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return parcels;

    // Keep leading zeros so "070" stays "070" and matches local-format numbers
    const digitQuery = query.replace(/\D/g, "");

    return parcels.filter(parcel => {
        if (parcel.householdName.toLowerCase().includes(query)) return true;

        if (digitQuery.length >= 1 && parcel.phoneNumber) {
            const storedDigits = parcel.phoneNumber.replace(/\D/g, "");
            // Normalize E.164 (+46701...) to local format (0701...) so both match
            const localStored = storedDigits.startsWith("46")
                ? "0" + storedDigits.slice(2)
                : storedDigits;
            return storedDigits.includes(digitQuery) || localStored.includes(digitQuery);
        }

        return false;
    });
}
