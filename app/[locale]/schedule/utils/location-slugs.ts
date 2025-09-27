/**
 * Utilities for converting between location IDs and URL-friendly slugs
 */

import { PickupLocation } from "../types";

/**
 * Convert a location name to a URL-friendly slug
 */
export function createLocationSlug(locationName: string): string {
    return locationName
        .toLowerCase()
        .replace(/[åä]/g, "a")
        .replace(/[ö]/g, "o")
        .replace(/[^a-z0-9]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

/**
 * Find a location by its slug
 */
export function findLocationBySlug(
    locations: PickupLocation[],
    slug: string,
): PickupLocation | null {
    return locations.find(location => createLocationSlug(location.name) === slug) || null;
}

/**
 * Get the slug for a location ID
 */
export function getLocationSlugById(
    locations: PickupLocation[],
    locationId: string,
): string | null {
    const location = locations.find(loc => loc.id === locationId);
    return location ? createLocationSlug(location.name) : null;
}

/**
 * Validate that a slug corresponds to a valid location
 */
export function isValidLocationSlug(locations: PickupLocation[], slug: string): boolean {
    return findLocationBySlug(locations, slug) !== null;
}
