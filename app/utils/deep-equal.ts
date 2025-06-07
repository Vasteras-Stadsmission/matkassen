import deepEqual from "fast-deep-equal";

/**
 * Deep equality comparison utility using fast-deep-equal
 *
 * @param a - First value to compare
 * @param b - Second value to compare
 * @returns true if values are deeply equal, false otherwise
 */
export function objectsEqual<T>(a: T, b: T): boolean {
    return deepEqual(a, b);
}
