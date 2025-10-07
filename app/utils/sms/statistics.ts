/**
 * SMS Statistics Calculation Utilities
 *
 * Shared utilities for calculating SMS success rates and other statistics
 * across both client and server components.
 */

/**
 * Multiplier for percentage with one decimal place precision
 * Formula: multiply by 1000, round, then divide by 10 = XX.X%
 *
 * Example: 0.847 → 847 → 850 → 85.0%
 */
const PERCENTAGE_PRECISION_MULTIPLIER = 1000;
const PERCENTAGE_DIVISOR = 10;

/**
 * Calculate success rate percentage with one decimal place
 *
 * @param sent - Number of successfully sent messages
 * @param failed - Number of failed messages
 * @returns Success rate as percentage (0-100) with one decimal place, or 100 if no messages finalized
 *
 * @example
 * ```typescript
 * calculateSuccessRate(8, 2)  // Returns 80.0 (8 / (8+2) * 100)
 * calculateSuccessRate(0, 0)  // Returns 100.0 (no finalized messages yet)
 * calculateSuccessRate(10, 0) // Returns 100.0 (perfect success)
 * calculateSuccessRate(0, 5)  // Returns 0.0 (all failed)
 * ```
 */
export function calculateSuccessRate(sent: number, failed: number): number {
    // Guard against division by zero when all messages are still pending
    if (sent + failed === 0) {
        return 100;
    }

    return (
        Math.round((sent / (sent + failed)) * PERCENTAGE_PRECISION_MULTIPLIER) / PERCENTAGE_DIVISOR
    );
}
