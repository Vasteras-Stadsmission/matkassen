/**
 * Shared test time constants for deterministic testing.
 *
 * IMPORTANT: Always use these constants instead of Date.now() or new Date()
 * in test factories and integration tests. This ensures:
 *
 * 1. Tests are fully deterministic and reproducible
 * 2. Tests don't fail based on when they're run
 * 3. Date-based logic (e.g., "upcoming parcels") works consistently
 *
 * Usage:
 *   import { TEST_NOW, daysFromTestNow, hoursFromTestNow } from "../test-time";
 *
 *   // Use TEST_NOW as the reference point
 *   const parcel = await createTestParcel({
 *     pickup_date_time_earliest: daysFromTestNow(1),
 *   });
 *
 *   // Pass TEST_NOW to query functions
 *   const results = await queryFailedSms(db, TEST_NOW);
 */

/**
 * Fixed "now" time for all tests.
 * All test data and queries should be relative to this date.
 *
 * Date chosen: 2024-06-15 10:00:00 UTC (a Saturday in summer)
 */
export const TEST_NOW = new Date("2024-06-15T10:00:00Z");

/**
 * Create a date X days from TEST_NOW.
 * Positive values = future, negative values = past.
 */
export function daysFromTestNow(days: number): Date {
    return new Date(TEST_NOW.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Create a date X hours from TEST_NOW.
 * Positive values = future, negative values = past.
 */
export function hoursFromTestNow(hours: number): Date {
    return new Date(TEST_NOW.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Create a date X minutes from TEST_NOW.
 * Positive values = future, negative values = past.
 */
export function minutesFromTestNow(minutes: number): Date {
    return new Date(TEST_NOW.getTime() + minutes * 60 * 1000);
}
