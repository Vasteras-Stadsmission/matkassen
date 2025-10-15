import ms, { type StringValue } from "ms";

/**
 * Parse human-readable duration string to milliseconds using Vercel's `ms` library.
 *
 * Supported formats:
 * - Long: "12 months", "5 minutes", "30 seconds", "2 hours", "7 days", "1 year"
 * - Short: "12M", "5m", "30s", "2h", "7d", "1y"
 *
 * @param duration - Human-readable duration string
 * @returns Milliseconds
 * @throws Error if duration format is invalid
 *
 * @example
 * parseDuration("12 months") // 31536000000
 * parseDuration("5 minutes") // 300000
 * parseDuration("30s") // 30000
 */
export function parseDuration(duration: string): number {
    const parsed = ms(duration as StringValue);

    if (typeof parsed !== "number" || isNaN(parsed) || parsed <= 0) {
        throw new Error(
            `Invalid duration format: "${duration}". ` +
                `Expected formats: "12 months", "5 minutes", "30s", etc.`,
        );
    }

    return parsed;
}

/**
 * Convert milliseconds back to human-readable format.
 *
 * @param milliseconds - Duration in milliseconds
 * @param long - Use long format ("1 year" vs "1y")
 * @returns Human-readable string
 *
 * @example
 * formatDuration(31536000000) // "1y"
 * formatDuration(31536000000, true) // "1 year"
 */
export function formatDuration(milliseconds: number, long = false): string {
    return ms(milliseconds, { long });
}
