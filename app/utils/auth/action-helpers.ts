/**
 * Helper utilities for working with ActionResult types in components
 */

import { type ActionResult } from "./action-result";

/**
 * Unwraps an ActionResult to get the data, throwing an error if unsuccessful.
 * Useful for actions where errors should bubble up to error boundaries.
 *
 * @example
 * ```typescript
 * const result = await myAction();
 * const data = unwrapResult(result); // Throws if result.success === false
 * ```
 */
export function unwrapResult<T>(result: ActionResult<T>): T {
    if (!result.success) {
        throw new Error(result.error.message);
    }
    return result.data;
}

/**
 * Checks if an ActionResult is successful and provides type narrowing.
 *
 * @example
 * ```typescript
 * const result = await myAction();
 * if (isSuccess(result)) {
 *   console.log(result.data); // Type-safe access
 * } else {
 *   console.error(result.error);
 * }
 * ```
 */
export function isSuccess<T>(result: ActionResult<T>): result is { success: true; data: T } {
    return result.success;
}

/**
 * Checks if an ActionResult is an error and provides type narrowing.
 *
 * @example
 * ```typescript
 * const result = await myAction();
 * if (isError(result)) {
 *   console.error(result.error.message);
 * }
 * ```
 */
export function isError<T>(
    result: ActionResult<T>,
): result is { success: false; error: { code: string; message: string; field?: string } } {
    return !result.success;
}

/**
 * Maps an ActionResult's data through a transformation function.
 * Preserves errors without modification.
 *
 * @example
 * ```typescript
 * const result = await getNumber();
 * const doubled = mapResult(result, n => n * 2);
 * ```
 */
export function mapResult<T, U>(result: ActionResult<T>, fn: (data: T) => U): ActionResult<U> {
    if (!result.success) {
        return result;
    }
    return { success: true, data: fn(result.data) };
}

/**
 * Combines multiple ActionResults, returning the first error or all successes.
 *
 * @example
 * ```typescript
 * const results = await Promise.all([action1(), action2(), action3()]);
 * const combined = combineResults(results);
 * if (combined.success) {
 *   const [data1, data2, data3] = combined.data;
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function combineResults<T extends readonly ActionResult<any>[]>(
    results: T,
): ActionResult<{ [K in keyof T]: T[K] extends ActionResult<infer U> ? U : never }> {
    for (const result of results) {
        if (!result.success) {
            return result;
        }
    }
    return {
        success: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: results.map(r => (r as any).data) as any,
    };
}
