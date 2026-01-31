/**
 * Shared constants for no-show follow-up settings.
 * Used by both settings actions and issues API.
 */

export const NOSHOW_FOLLOWUP_ENABLED_KEY = "noshow_followup_enabled";
export const NOSHOW_CONSECUTIVE_THRESHOLD_KEY = "noshow_consecutive_threshold";
export const NOSHOW_TOTAL_THRESHOLD_KEY = "noshow_total_threshold";

// Validation bounds
export const NOSHOW_CONSECUTIVE_MIN = 1;
export const NOSHOW_CONSECUTIVE_MAX = 10;
export const NOSHOW_CONSECUTIVE_DEFAULT = 2;

export const NOSHOW_TOTAL_MIN = 1;
export const NOSHOW_TOTAL_MAX = 50;
export const NOSHOW_TOTAL_DEFAULT = 4;

// Household ID format (8-character alphanumeric nanoid)
export const HOUSEHOLD_ID_REGEX = /^[0-9A-Za-z_-]{8}$/;

/**
 * Safely parse a threshold value from string storage.
 * Returns the default if value is null, undefined, NaN, or out of bounds.
 */
export function parseThreshold(
    value: string | null | undefined,
    defaultValue: number,
    min: number,
    max: number,
): number {
    if (!value) return defaultValue;
    const parsed = parseInt(value, 10);
    if (isNaN(parsed) || parsed < min || parsed > max) return defaultValue;
    return parsed;
}
