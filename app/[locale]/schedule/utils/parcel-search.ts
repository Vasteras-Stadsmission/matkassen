import type { FoodParcel } from "../types";

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
